// How to play: controls (touch + keyboard), the five stats, four core tips. Opened from the title screen and the pause menu.
const STATS = [
  ['Health', '#e63946', 'Hits 0 and you die. Regenerates when you are fed, watered and warm.'],
  ['Hunger', '#e9a23b', 'Eat berries and cooked meat. Raw meat can poison you.'],
  ['Thirst', '#4aa3df', 'Melt snow at a fire in a tin pot, then boil it. Plain snow chills you.'],
  ['Warmth', '#ff7a45', 'The main killer. Fires, walls, clothes and shelter keep it up.'],
  ['Stamina', '#7bd389', 'Sprinting and swinging use it. It refills when you rest.'],
];
const TIPS = [
  'Cold is your enemy: stay near a fire and feed it. Night and blizzards are far colder.',
  'Walls and a door around your fire trap heat and keep wolves out.',
  'Find the three wreckage sites for radio parts, then build the radio tower and signal for three nights.',
  'Every death is a decision. Stock fuel and food before dusk.',
];

export default {
  id: 'howto', title: 'How to play', modal: true,
  render(game, body) {
    body.innerHTML = `<div class="howto">
      <h3>Touch</h3><ul><li><b>Left thumb</b>: floating stick to move. Push to the edge to sprint.</li>
        <li><b>Act</b>: gather, open, attack, interact with the highlighted thing.</li>
        <li><b>Use</b> eats or uses the selected hotbar item. <b>Bag</b> holds items and crafting. <b>Build</b> places walls, fires and more.</li></ul>
      <h3>Keyboard</h3><ul><li><b>WASD / arrows</b> move, <b>Shift</b> sprint, <b>Space / click</b> act, <b>E</b> interact, <b>F</b> use item</li>
        <li><b>I / Tab</b> bag, <b>C</b> craft, <b>B</b> build, <b>1-5</b> hotbar, <b>Esc</b> pause</li></ul>
      <h3>Your five stats</h3>
      <div class="ht-stats">${STATS.map(([n, c, d]) => `<div class="ht-stat"><i style="background:${c}"></i><span><b>${n}</b> ${d}</span></div>`).join('')}</div>
      <h3>Four core tips</h3><ol>${TIPS.map((t) => `<li>${t}</li>`).join('')}</ol></div>`;
    return {};
  },
};
