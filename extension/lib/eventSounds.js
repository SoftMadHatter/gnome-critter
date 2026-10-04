// Sounds the extension plays by itself (an achievement, a coin, a blunder),
// as opposed to a critter's reaction sounds, which belong to its pack.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

/**
 * Plays extension/assets/sounds/<name>.wav, unless sounds are turned off.
 * @param {string} extensionPath
 * @param {Gio.Settings} settings
 * @param {'achievement'|'coin'|'blunder'} name
 */
export function playEventSound(extensionPath, settings, name) {
  if (!settings.get_boolean('sounds-enabled')) return;
  const file = Gio.File.new_for_path(GLib.build_filenamev([extensionPath, 'assets', 'sounds', `${name}.wav`]));
  global.display.get_sound_player().play_from_file(file, `Critter: ${name}`, null);
}
