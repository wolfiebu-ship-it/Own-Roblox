'use strict';
// Namensfilter: dieselben Regeln wie im Spiel (index.html), damit der Server die letzte Prüfung macht.
const BAD_SUB = ['fick', 'fuck', 'fuk', 'porn', 'sex', 'fotze', 'hurensohn', 'wichs', 'wixer', 'schlampe', 'arschloch', 'missgeburt', 'nigger', 'nigga', 'neger', 'schwuchtel', 'vergewalt', 'paedophil', 'pedophil', 'hitler', 'nazi', 'siegheil', 'nutte', 'titten', 'penis', 'pimmel', 'vagina', 'muschi', 'pussy', 'bitch', 'slut', 'whore', 'horny', 'nudes', 'nackt', 'kanake', 'faggot', 'retard', 'asshole', 'bastard', 'scheis', 'shit', 'kacke', 'spast', 'behindert', 'suicide', 'selbstmord', 'dildo', 'orgasm', 'cock', 'tits', 'dummkopf', 'vollidiot', 'blowjob', 'erotik', 'kondom', 'busen', 'schwanzlutsch', 'milf'];
const BAD_WORD = ['arsch', 'dick', 'cum', 'geil', 'opfer', 'dumm', 'idiot', 'depp', 'hure', 'ass', 'anal', 'heil', 'kill', 'tod', 'loser', 'penner', 'nsfw', 'sau', 'schwein', 'fett', 'hass', 'schwanz', 'boobs', 'kys', 'noob'];

function normName(t) {
  return t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[0]/g, 'o').replace(/[@4]/g, 'a').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[5$]/g, 's').replace(/7/g, 't').replace(/8/g, 'b')
    .replace(/[^a-z]/g, '').replace(/(.)\1+/g, '$1');
}
const SUB_N = BAD_SUB.map(normName);
const WORD_N = BAD_WORD.map(normName);

function nameProblem(name) {
  const n = String(name || '').trim();
  if (n.length < 3) return 'Der Name braucht mindestens 3 Zeichen.';
  if (n.length > 16) return 'Der Name darf höchstens 16 Zeichen haben.';
  const all = normName(n);
  const tokens = n.replace(/([a-z])([A-Z])/g, '$1 $2').split(/[\s_-]+/).map(normName).filter(Boolean);
  const bad = SUB_N.some(w => all.includes(w)) ||
    WORD_N.some(w => tokens.includes(w) || all === w || (w.length >= 4 && w !== 'anal' && w !== 'heil' && (all.startsWith(w) || all.endsWith(w))));
  return bad ? 'Dieser Name ist nicht erlaubt. Bitte wähle einen freundlichen Namen.' : '';
}

module.exports = { nameProblem };
