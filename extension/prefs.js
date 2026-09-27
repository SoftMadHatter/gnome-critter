import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { _, N_, setTranslator, sessionLanguage, language } from './core/i18n.js';
import { localizePack } from './core/packTranslations.js';

/**
 * Liste les packs installés : chaque sous-dossier de `packs/` qui contient
 * un pack.json lisible. Inline ici plutôt que via lib/packLoader.js, qui
 * importe St/Cogl, indisponibles dans le processus GTK des préférences.
 * @returns {{id: string, label: string}[]}
 */
function listPacks(extensionPath) {
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
      const [, contents] = packsDir.get_child(id).get_child('pack.json').load_contents(null);
      const meta = JSON.parse(new TextDecoder('utf-8').decode(contents));
      packs.push({ id, label: localizePack(meta, language()).displayName ?? id });
    } catch {
      // Dossier sans pack.json valide : pas un pack, on l'ignore.
    }
  }

  return packs.sort((a, b) => a.label.localeCompare(b.label));
}

export default class CritterPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    // Textes dans la langue de la session (catalogue locale/<langue>/LC_MESSAGES/gnome-critter.mo).
    this.initTranslations?.();
    setTranslator({
      gettext: (text) => this.gettext(text),
      ngettext: (singular, plural, n) => this.ngettext(singular, plural, n),
      language: sessionLanguage(GLib.get_language_names()),
    });
    const settings = this.getSettings();

    // Tous les réglages s'appliquent immédiatement, sans recharger l'extension
    // (changer d'animal ou de nombre recrée le gestionnaire à chaud).
    const generalPage = new Adw.PreferencesPage({ title: _('Général'), icon_name: 'preferences-system-symbolic' });
    const group = new Adw.PreferencesGroup({ title: _('Animaux'), description: _('Les changements sont appliqués tout de suite.') });
    generalPage.add(group);

    const lifePage = new Adw.PreferencesPage({ title: _('Besoins et vie'), icon_name: 'emblem-favorite-symbolic' });
    const lifeGroup = new Adw.PreferencesGroup({ title: _('Besoins et croissance') });
    lifePage.add(lifeGroup);

    const worldPage = new Adw.PreferencesPage({ title: _('Rythme et capteurs'), icon_name: 'preferences-system-time-symbolic' });

    const packs = listPacks(this.path);
    const packRow = new Adw.ComboRow({
      title: _('Animal'),
      model: Gtk.StringList.new(packs.map((p) => p.label)),
    });
    // Pack actif introuvable : aucune sélection, et le réglage n'est pas
    // écrasé tant que l'utilisateur ne choisit pas explicitement.
    const current = packs.findIndex((p) => p.id === settings.get_string('pack-id'));
    packRow.selected = current >= 0 ? current : Gtk.INVALID_LIST_POSITION;
    packRow.connect('notify::selected', () => {
      const pack = packs[packRow.selected];
      if (pack) settings.set_string('pack-id', pack.id);
    });
    group.add(packRow);

    const countRow = new Adw.SpinRow({
      title: _("Nombre d'animaux"),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1 }),
    });
    settings.bind('critter-count', countRow, 'value', 0);
    group.add(countRow);

    const soundsRow = new Adw.SwitchRow({ title: _('Sons activés') });
    settings.bind('sounds-enabled', soundsRow, 'active', 0);
    group.add(soundsRow);

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
    settings.bind('vacation-mode', vacationRow, 'active', 0);
    lifeGroup.add(vacationRow);

    const indicatorRow = new Adw.SwitchRow({
      title: _('Icône dans la barre supérieure'),
      subtitle: _('Humeur et menu des animaux.'),
    });
    settings.bind('show-indicator', indicatorRow, 'active', 0);
    group.add(indicatorRow);

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
    settings.bind('prey-spawn', preyRow, 'active', 0);
    lifeGroup.add(preyRow);

    const plantsRow = new Adw.SwitchRow({
      title: _('Plantes décoratives'),
      subtitle: _('Des plantes à grignoter sont maintenues sur le bureau.'),
    });
    settings.bind('decor-plants', plantsRow, 'active', 0);
    lifeGroup.add(plantsRow);

    const growthRow = new Adw.SwitchRow({
      title: _('Croissance'),
      subtitle: _("Un animal neuf naît d'un œuf et grandit ; désactivée, il naît adulte."),
    });
    settings.bind('growth-enabled', growthRow, 'active', 0);
    lifeGroup.add(growthRow);

    const growthSpeedRow = new Adw.SpinRow({
      title: _('Vitesse de croissance'),
      subtitle: _('1 = temps réel. Plus haut pour essayer les stades sans attendre.'),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 1000, step_increment: 1, page_increment: 10 }),
    });
    settings.bind('growth-speed', growthSpeedRow, 'value', 0);
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
    settings.bind('day-night', dayNightRow, 'active', 0);
    worldGroup.add(dayNightRow);

    const awayRow = new Adw.SwitchRow({
      title: _('Dormir en votre absence'),
      subtitle: _('Ils s\'endorment quand vous êtes inactif, et vous accueillent à votre retour.'),
    });
    settings.bind('away-sleep', awayRow, 'active', 0);
    worldGroup.add(awayRow);

    const awayMinutesRow = new Adw.SpinRow({
      title: _("Minutes d'inactivité avant l'absence"),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 240, step_increment: 1, page_increment: 10 }),
    });
    settings.bind('away-minutes', awayMinutesRow, 'value', 0);
    worldGroup.add(awayMinutesRow);

    const breakRow = new Adw.SwitchRow({
      title: _('Rappel de pause'),
      subtitle: _('Un animal vient vers votre curseur après une longue période d\'activité.'),
    });
    settings.bind('break-reminder', breakRow, 'active', 0);
    worldGroup.add(breakRow);

    const breakMinutesRow = new Adw.SpinRow({
      title: _("Minutes d'activité avant le rappel"),
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 480, step_increment: 5, page_increment: 30 }),
    });
    settings.bind('break-minutes', breakMinutesRow, 'value', 0);
    worldGroup.add(breakMinutesRow);

    const notificationsRow = new Adw.SwitchRow({
      title: _('Réagir aux notifications'),
      subtitle: _("Seul le fait qu'une notification arrive est utilisé, jamais son contenu."),
    });
    settings.bind('react-notifications', notificationsRow, 'active', 0);
    worldGroup.add(notificationsRow);

    const typingRow = new Adw.SwitchRow({
      title: _('Réagir à la frappe'),
      subtitle: _("Compte seulement qu'une touche est pressée, jamais laquelle."),
    });
    settings.bind('react-typing', typingRow, 'active', 0);
    worldGroup.add(typingRow);

    window.add(generalPage);
    window.add(lifePage);
    window.add(worldPage);
  }
}
