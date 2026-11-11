// Build menu placeholder. The building engineer replaces render() with the real structure picker.
export default {
  id: 'build', title: 'Build', modal: false,
  render(game, body) { body.innerHTML = '<p class="muted">Building is not implemented yet.</p>'; return {}; },
};
