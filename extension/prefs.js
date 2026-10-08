import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { _, N_, setTranslator, sessionLanguage, language } from './core/i18n.js';
import { localizePack } from './core/packTranslations.js';

Gio._promisify(Gio.File.prototype, 'load_contents_async', 'load_contents_finish');

/**
 * Lists the installed packs: every `packs/` subfolder that has a readable
 * pack.json. Inlined here rather than via lib/packLoader.js, which imports
 * St/Cogl, unavailable in the preferences' GTK process.
 * @returns {Promise<{id: string, label: string}[]>}
 */
async function listPacks(extensionPath) {
  const packsDir = Gio.File.new_for_path(extensionPath).get_child('packs');
  const packs = [];
  let children;
  try {
    children = packsDir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
  } catch {
    return packs;
  }

  for (let info = children.next_file(null); info; info = children.next_file(null)) {
    if (info.get_file_type() !== Gio.FileType.DIRECTORY) continue;
    const id = info.get_name();
    try {
      const [contents] = await packsDir.get_child(id).get_child('pack.json').load_contents_async(null);
      const meta = JSON.parse(new TextDecoder('utf-8').decode(contents));
      packs.push({ id, label: localizePack(meta, language()).displayName ?? id });
    } catch {
      // Folder with no valid pack.json: not a pack, skip it.
    }
  }

  return packs.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Reads the `critter-mix` setting (JSON array of `{pack, count}`): drops
 * entries whose pack id isn't actually installed or whose count isn't a
 * positive number. Falls back to one entry of the first installed pack if
 * nothing valid remains (mirrors extension.js's own defensive parsing).
 * @param {{id: string}[]} packs installed packs, from listPacks()
 * @returns {{pack: string, count: number}[]}
 */
function readMix(settings, packs) {
  let raw;
  try {
    raw = JSON.parse(settings.get_string('critter-mix'));
  } catch {
    raw = null;
  }
  const known = new Set(packs.map((p) => p.id));
  const entries = Array.isArray(raw) ? raw : [];
  const clean = entries
    .filter((e) => known.has(e?.pack) && Number.isFinite(e?.count) && e.count >= 1)
    .map((e) => ({ pack: e.pack, count: Math.floor(e.count) }));
  return clean.length > 0 ? clean : packs[0] ? [{ pack: packs[0].id, count: 1 }] : [];
}

/**
 * One species picker + count per `critter-mix` entry, followed by an "add a
 * species" row, in a list of their own (rebuilt on every add/remove).
 * @param {Adw.PreferencesGroup} group
 * @param {Gio.Settings} settings
 * @param {{id: string, label: string}[]} packs installed packs, from listPacks()
 */
function buildMixRows(group, settings, packs) {
  const mix = readMix(settings, packs);
  const list = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, css_classes: ['boxed-list'] });
  group.add(list);

  const writeMix = () => settings.set_string('critter-mix', JSON.stringify(mix));

  const addRow = () => {
    const onAdd = () => {
      const used = new Set(mix.map((e) => e.pack));
      const next = packs.find((p) => !used.has(p.id)) ?? packs[0];
      if (!next) return;
      mix.push({ pack: next.id, count: 1 });
      writeMix();
      render();
    };
    const row = new Adw.ButtonRow({ title: _('Ajouter une espèce'), start_icon_name: 'list-add-symbolic' });
    row.connect('activated', onAdd);
    return row;
  };

  const render = () => {
    for (let child = list.get_first_child(); child; child = list.get_first_child()) list.remove(child);
    mix.forEach((entry, index) => {
      const packRow = new Adw.ComboRow({
        title: _('Animal'),
        model: Gtk.StringList.new(packs.map((p) => p.label)),
      });
      const current = packs.findIndex((p) => p.id === entry.pack);
      packRow.selected = current >= 0 ? current : Gtk.INVALID_LIST_POSITION;
      packRow.connect('notify::selected', () => {
        const pack = packs[packRow.selected];
        if (pack) {
          entry.pack = pack.id;
          writeMix();
        }
      });
      list.append(packRow);

      const countRow = new Adw.SpinRow({
        title: _("Nombre d'animaux"),
        adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1 }),
        value: entry.count,
      });
      countRow.connect('notify::value', () => {
        entry.count = countRow.value;
        writeMix();
      });
      if (mix.length > 1) {
        const removeButton = new Gtk.Button({
          icon_name: 'user-trash-symbolic',
          valign: Gtk.Align.CENTER,
          css_classes: ['flat'],
          tooltip_text: _('Retirer cette espèce'),
        });
        removeButton.connect('clicked', () => {
          mix.splice(index, 1);
          writeMix();
          render();
        });
        countRow.add_suffix(removeButton);
      }
      list.append(countRow);
    });
    list.append(addRow());
  };

  render();
}

export default class CritterPreferences extends ExtensionPreferences {
  async fillPreferencesWindow(window) {
    // Text in the session's language (locale/<language>/LC_MESSAGES/gnome-critter.mo catalog).
    this.initTranslations();
    setTranslator({
      gettext: (text) => this.gettext(text),
      ngettext: (singular, plural, n) => this.ngettext(singular, plural, n),
      language: sessionLanguage(GLib.get_language_names()),
    });
    const settings = this.getSettings();

    // Every setting applies immediately, without reloading the extension
    // (changing the critter or the count recreates the manager live).
    const generalPage = new Adw.PreferencesPage({ title: _('Général'), icon_name: 'preferences-system-symbolic' });
    const group = new Adw.PreferencesGroup({
      title: _('Animaux'),
      description: _('Les changements sont appliqués tout de suite. 10 animaux au total, tous ensemble.'),
    });
    generalPage.add(group);
    // Not in the species group: its rows would sit above the species list.
    const generalGroup = new Adw.PreferencesGroup();
    generalPage.add(generalGroup);

    const lifePage = new Adw.PreferencesPage({ title: _('Besoins et vie'), icon_name: 'emblem-favorite-symbolic' });
    const lifeGroup = new Adw.PreferencesGroup({ title: _('Besoins et croissance') });
    lifePage.add(lifeGroup);

    const worldPage = new Adw.PreferencesPage({ title: _('Rythme et capteurs'), icon_name: 'preferences-system-time-symbolic' });

    const packs = await listPacks(this.path);
    buildMixRows(group, settings, packs);

    const soundsGroup = new Adw.PreferencesGroup({ title: _('Sons') });
    generalPage.add(soundsGroup);
    const soundsRow = new Adw.SwitchRow({ title: _('Tous les sons') });
    settings.bind('sounds-enabled', soundsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    soundsGroup.add(soundsRow);
    const soundCategories = [
      ['sounds-voices', N_('Voix des animaux'), N_('Caresses, chatouilles, surprise, agacement, ronron, maladie...')],
      ['sounds-life', N_('Moments de vie'), N_('Éclosion, croissance, anniversaire, cadeaux, tours appris, rappels de pause.')],
      ['sounds-game', N_('Succès, pièces et bourdes'), N_('Succès débloqués, pièces gagnées ou dépensées, bourdes.')],
    ];
    for (const [key, title, subtitle] of soundCategories) {
      const row = new Adw.SwitchRow({ title: _(title), subtitle: _(subtitle) });
      settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
      settings.bind('sounds-enabled', row, 'sensitive', Gio.SettingsBindFlags.GET);
      soundsGroup.add(row);
    }

    const difficulties = [
      ['relaxed', N_('Détendue')],
      ['normal', N_('Normale')],
      ['strict', N_('Stricte')],
    ];
    const difficultyRow = new Adw.ComboRow({
      title: _('Difficulté'),
      subtitle: _('Vitesse à laquelle les besoins des animaux baissent.'),
      model: Gtk.StringList.new(difficulties.map(([, label]) => _(label))),
    });
    difficultyRow.selected = Math.max(
      0,
      difficulties.findIndex(([id]) => id === settings.get_string('difficulty')),
    );
    difficultyRow.connect('notify::selected', () => {
      settings.set_string('difficulty', difficulties[difficultyRow.selected][0]);
    });
    lifeGroup.add(difficultyRow);

    const vacationRow = new Adw.SwitchRow({
      title: _('Mode vacances'),
      subtitle: _('Fige tous les besoins des animaux.'),
    });
    settings.bind('vacation-mode', vacationRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    lifeGroup.add(vacationRow);

    const indicatorRow = new Adw.SwitchRow({
      title: _('Icône dans la barre supérieure'),
      subtitle: _('Humeur et menu des animaux.'),
    });
    settings.bind('show-indicator', indicatorRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    generalGroup.add(indicatorRow);

    const autonomies = [
      ['auto', N_('Auto (suit la croissance)')],
      ['off', N_('Désactivée')],
      ['partial', N_('Partielle')],
      ['full', N_('Totale')],
    ];
    const autonomyRow = new Adw.ComboRow({
      title: _('Autonomie'),
      subtitle: _('Les animaux autonomes chassent, grignotent et voient leurs besoins baisser plus lentement.'),
      model: Gtk.StringList.new(autonomies.map(([, label]) => _(label))),
    });
    autonomyRow.selected = Math.max(0, autonomies.findIndex(([id]) => id === settings.get_string('autonomy')));
    autonomyRow.connect('notify::selected', () => settings.set_string('autonomy', autonomies[autonomyRow.selected][0]));
    lifeGroup.add(autonomyRow);

    const preyRow = new Adw.SwitchRow({
      title: _('Proies automatiques'),
      subtitle: _('Des proies apparaissent de temps en temps pour les animaux autonomes.'),
    });
    settings.bind('prey-spawn', preyRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    lifeGroup.add(preyRow);

    const plantsRow = new Adw.SwitchRow({
      title: _('Plantes décoratives'),
      subtitle: _('Des plantes à grignoter sont maintenues sur le bureau.'),
    });
    settings.bind('decor-plants', plantsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    lifeGroup.add(plantsRow);

    const growthRow = new Adw.SwitchRow({
      title: _('Croissance'),
      subtitle: _("Un animal neuf naît d'un œuf et grandit ; désactivée, il naît adulte."),
    });
    settings.bind('growth-enabled', growthRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    lifeGroup.add(growthRow);

    const growthSpeedRow = new Adw.SpinRow({
      title: _('Vitesse de croissance'),
      subtitle: _('1 = temps réel. Plus haut pour essayer les stades sans attendre.'),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 1000, step_increment: 1, page_increment: 10 }),
    });
    settings.bind('growth-speed', growthSpeedRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    lifeGroup.add(growthSpeedRow);

    const worldGroup = new Adw.PreferencesGroup({
      title: _('Rythme et capteurs'),
      description: _("Aucun contenu n'est jamais lu : ni notifications, ni touches."),
    });
    worldPage.add(worldGroup);

    const dayNightRow = new Adw.SwitchRow({
      title: _('Cycle jour/nuit'),
      subtitle: _('De 23 h à 7 h, les animaux dorment davantage et sont légèrement assombris.'),
    });
    settings.bind('day-night', dayNightRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    worldGroup.add(dayNightRow);

    const awayRow = new Adw.SwitchRow({
      title: _('Dormir en votre absence'),
      subtitle: _("Ils s'endorment quand vous êtes inactif, et vous accueillent à votre retour."),
    });
    settings.bind('away-sleep', awayRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    worldGroup.add(awayRow);

    const awayMinutesRow = new Adw.SpinRow({
      title: _("Minutes d'inactivité avant l'absence"),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 240, step_increment: 1, page_increment: 10 }),
    });
    settings.bind('away-minutes', awayMinutesRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    worldGroup.add(awayMinutesRow);

    const breakRow = new Adw.SwitchRow({
      title: _('Rappel de pause'),
      subtitle: _("Un animal vient vers votre curseur après une longue période d'activité."),
    });
    settings.bind('break-reminder', breakRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    worldGroup.add(breakRow);

    const breakMinutesRow = new Adw.SpinRow({
      title: _("Minutes d'activité avant le rappel"),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 480, step_increment: 5, page_increment: 30 }),
    });
    settings.bind('break-minutes', breakMinutesRow, 'value', Gio.SettingsBindFlags.DEFAULT);
    worldGroup.add(breakMinutesRow);

    const notificationsRow = new Adw.SwitchRow({
      title: _('Réagir aux notifications'),
      subtitle: _("Seul le fait qu'une notification arrive est utilisé, jamais son contenu."),
    });
    settings.bind('react-notifications', notificationsRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    worldGroup.add(notificationsRow);

    const typingRow = new Adw.SwitchRow({
      title: _('Réagir à la frappe'),
      subtitle: _("Compte seulement qu'une touche est pressée, jamais laquelle."),
    });
    settings.bind('react-typing', typingRow, 'active', Gio.SettingsBindFlags.DEFAULT);
    worldGroup.add(typingRow);

    window.add(generalPage);
    window.add(lifePage);
    window.add(worldPage);
  }
}
