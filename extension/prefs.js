import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

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
      packs.push({ id, label: meta.displayName ?? id });
    } catch {
      // Dossier sans pack.json valide : pas un pack, on l'ignore.
    }
  }

  return packs.sort((a, b) => a.label.localeCompare(b.label));
}

export default class ScamperPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup({ title: 'Scamper' });
    page.add(group);

    const packs = listPacks(this.path);
    const packRow = new Adw.ComboRow({
      title: 'Animal',
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
      title: "Nombre d'animaux",
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 10, step_increment: 1 }),
    });
    settings.bind('critter-count', countRow, 'value', 0);
    group.add(countRow);

    const soundsRow = new Adw.SwitchRow({ title: 'Sons activés' });
    settings.bind('sounds-enabled', soundsRow, 'active', 0);
    group.add(soundsRow);

    const difficulties = [
      ['relaxed', 'Détendue'],
      ['normal', 'Normale'],
      ['strict', 'Stricte'],
    ];
    const difficultyRow = new Adw.ComboRow({
      title: 'Difficulté',
      subtitle: 'Vitesse à laquelle les besoins des animaux baissent.',
      model: Gtk.StringList.new(difficulties.map(([, label]) => label)),
    });
    difficultyRow.selected = Math.max(
      0,
      difficulties.findIndex(([id]) => id === settings.get_string('difficulty')),
    );
    difficultyRow.connect('notify::selected', () => {
      settings.set_string('difficulty', difficulties[difficultyRow.selected][0]);
    });
    group.add(difficultyRow);

    const vacationRow = new Adw.SwitchRow({
      title: 'Mode vacances',
      subtitle: 'Fige tous les besoins des animaux.',
    });
    settings.bind('vacation-mode', vacationRow, 'active', 0);
    group.add(vacationRow);

    const indicatorRow = new Adw.SwitchRow({
      title: 'Icône dans la barre supérieure',
      subtitle: 'Humeur et jauges des animaux (effective à la réactivation de l\'extension).',
    });
    settings.bind('show-indicator', indicatorRow, 'active', 0);
    group.add(indicatorRow);

    const growthRow = new Adw.SwitchRow({
      title: 'Croissance',
      subtitle: "Un animal neuf naît d'un œuf et grandit ; désactivée, il naît adulte.",
    });
    settings.bind('growth-enabled', growthRow, 'active', 0);
    group.add(growthRow);

    const growthSpeedRow = new Adw.SpinRow({
      title: 'Vitesse de croissance',
      subtitle: '1 = temps réel. Plus haut pour essayer les stades sans attendre.',
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 1000, step_increment: 1, page_increment: 10 }),
    });
    settings.bind('growth-speed', growthSpeedRow, 'value', 0);
    group.add(growthSpeedRow);

    const worldGroup = new Adw.PreferencesGroup({
      title: 'Rythme et capteurs',
      description: "Aucun contenu n'est jamais lu : ni notifications, ni touches.",
    });
    page.add(worldGroup);

    const dayNightRow = new Adw.SwitchRow({
      title: 'Cycle jour/nuit',
      subtitle: 'De 23 h à 7 h, les animaux dorment davantage et sont légèrement assombris.',
    });
    settings.bind('day-night', dayNightRow, 'active', 0);
    worldGroup.add(dayNightRow);

    const awayRow = new Adw.SwitchRow({
      title: 'Dormir en votre absence',
      subtitle: 'Ils s\'endorment quand vous êtes inactif, et vous accueillent à votre retour.',
    });
    settings.bind('away-sleep', awayRow, 'active', 0);
    worldGroup.add(awayRow);

    const awayMinutesRow = new Adw.SpinRow({
      title: "Minutes d'inactivité avant l'absence",
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 240, step_increment: 1, page_increment: 10 }),
    });
    settings.bind('away-minutes', awayMinutesRow, 'value', 0);
    worldGroup.add(awayMinutesRow);

    const breakRow = new Adw.SwitchRow({
      title: 'Rappel de pause',
      subtitle: 'Un animal vient vers votre curseur après une longue période d\'activité.',
    });
    settings.bind('break-reminder', breakRow, 'active', 0);
    worldGroup.add(breakRow);

    const breakMinutesRow = new Adw.SpinRow({
      title: "Minutes d'activité avant le rappel",
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 480, step_increment: 5, page_increment: 30 }),
    });
    settings.bind('break-minutes', breakMinutesRow, 'value', 0);
    worldGroup.add(breakMinutesRow);

    const notificationsRow = new Adw.SwitchRow({
      title: 'Réagir aux notifications',
      subtitle: "Seul le fait qu'une notification arrive est utilisé, jamais son contenu.",
    });
    settings.bind('react-notifications', notificationsRow, 'active', 0);
    worldGroup.add(notificationsRow);

    const typingRow = new Adw.SwitchRow({
      title: 'Réagir à la frappe',
      subtitle: "Compte seulement qu'une touche est pressée, jamais laquelle.",
    });
    settings.bind('react-typing', typingRow, 'active', 0);
    worldGroup.add(typingRow);

    const noteRow = new Adw.ActionRow({
      title: 'Le changement d\'animal ou de nombre demande de désactiver/réactiver l\'extension.',
    });
    group.add(noteRow);

    window.add(page);
  }
}
