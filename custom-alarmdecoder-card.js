class CustomAlarmdecoderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._code = '';
    this._config = null;
    this._hass = null;
  }

  static getConfigElement() {
    return document.createElement('custom-alarmdecoder-card-editor');
  }

  static getStubConfig() {
    return {
      entity: 'alarm_control_panel.alarmdecoder',
      display_entity: '',
      title: 'Alarma'
    };
  }

  setConfig(config) {
    if (!config.entity) throw new Error('Entity is required');
    this._config = config;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.updateState();
  }

  get hass() { return this._hass; }
  getCardSize() { return 4; }

  updateState() {
    if (!this._hass || !this._config) return;
    const alarm = this._hass.states[this._config.entity];

    const zonesList = this.shadowRoot.querySelector('.zones-list');
    if (zonesList && zonesList.children.length === 0) {
      this.updateZones();
    }

    if (!alarm) return;

    const state = alarm.state;
    const statusDot = this.shadowRoot.querySelector('.status-dot');
    const statusText = this.shadowRoot.querySelector('.status-text');
    const displayEl = this.shadowRoot.querySelector('.display-text');
    const armSection = this.shadowRoot.querySelector('.arm-section');
    const disarmSection = this.shadowRoot.querySelector('.disarm-section');
    const codeHint = this.shadowRoot.querySelector('.code-hint');

    if (statusDot) statusDot.className = 'status-dot ' + state;

    if (statusText) {
      const labels = { 'disarmed': 'Abierta', 'armed_away': 'Armada', 'armed_home': 'Estancia', 'pending': 'Armando...', 'triggered': 'ALARMA' };
      statusText.textContent = labels[state] || state;
    }

    if (displayEl) {
      if (this._config.display_entity) {
        const ds = this._hass.states[this._config.display_entity];
        displayEl.textContent = (ds && ds.state) ? ds.state : '---';
      } else {
        displayEl.textContent = this._code ? '*'.repeat(this._code.length) : '---';
      }
    }

    if (armSection) armSection.style.display = (state === 'disarmed') ? 'flex' : 'none';
    if (disarmSection) disarmSection.style.display = (state !== 'disarmed') ? 'flex' : 'none';

    if (codeHint) {
      codeHint.textContent = this._code.length > 0 ? `${this._code.length} dígitos` : '';
    }

    this._getAllZones().forEach(zone => {
      const sw = this.shadowRoot.querySelector(`[data-zone="${zone.entity}"]`);
      if (sw && this._hass.states[zone.entity]) {
        sw.checked = this._hass.states[zone.entity].state === 'on';
      }
    });
  }

  _getAllZones() {
    if (!this._hass) return [];
    const zones = [];
    const diagEntities = ['ac_power', 'battery_low', 'ready', 'check_zone', 'chime', 'programming_mode', 'entry_delay_off', 'zone_bypassed', 'alarm_event', 'panel_delay', 'rf_low_battery', 'rf_supervised'];

    Object.keys(this._hass.states).forEach(entityId => {
      if (!entityId.startsWith('binary_sensor.')) return;
      if (diagEntities.some(d => entityId.includes(d))) return;

      const state = this._hass.states[entityId];
      if (!state) return;

      const friendlyName = state.attributes?.friendly_name || '';
      const match = friendlyName.match(/^(\d+)\s*-\s*(.+)/);
      if (match) {
        zones.push({
          entity: entityId,
          name: friendlyName,
          zone_number: parseInt(match[1], 10)
        });
      }
    });
    return zones.sort((a, b) => a.zone_number - b.zone_number);
  }

  handleKeyPress(key) {
    if (key === 'clear') this._code = '';
    else if (this._code.length < 8) this._code += key;
    this.updateState();
  }

  handleArmAction(action) {
    if (!this._hass || !this._config) return;
    if (!this._code) { this.showError('Ingrese código'); return; }
    this._hass.callService('alarm_control_panel', action, {
      entity_id: this._config.entity, code: this._code
    });
    this._code = '';
    this.updateState();
  }

  handleDisarm() {
    if (!this._hass || !this._config) return;
    if (!this._code) { this.showError('Ingrese código'); return; }
    this._hass.callService('alarm_control_panel', 'alarm_disarm', {
      entity_id: this._config.entity, code: this._code
    });
    this._code = '';
    this.updateState();
  }

  handleBypassToggle(entityId) {
    if (!this._hass) return;
    this._hass.callService('homeassistant', 'toggle', { entity_id: entityId });
  }

  showError(msg) {
    const el = this.shadowRoot.querySelector('.error-msg');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 2000);
    }
  }

  render() {
    if (!this._config) return;
    const title = this._config.title || 'Alarma';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; }
        .card {
          background: var(--card-background-color, #fff);
          border-radius: var(--border-radius, 16px);
          box-shadow: var(--box-shadow, 0 2px 8px rgba(0,0,0,0.08));
          padding: 20px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .header { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; }
        .header-title { font-size: 15px; font-weight: 600; color: var(--primary-text-color, #212121); flex: 1; }
        .status-dot { width: 10px; height: 10px; border-radius: 50%; transition: all 0.3s ease; }
        .status-dot.disarmed { background: #4caf50; box-shadow: 0 0 8px #4caf50; }
        .status-dot.armed_away, .status-dot.armed_home { background: #ff9800; box-shadow: 0 0 8px #ff9800; }
        .status-dot.pending { background: #2196f3; animation: pulse 1s infinite; }
        .status-dot.triggered { background: #f44336; animation: blink 0.5s infinite; }
        .status-text { font-size: 13px; color: var(--secondary-text-color, #757575); }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

        .display { background: #111; border-radius: 10px; padding: 14px; margin-bottom: 6px; text-align: center; }
        .display-text { font-family: 'SF Mono', monospace; font-size: 18px; color: #00ff88; letter-spacing: 3px; min-height: 24px; }
        .code-hint { text-align: right; font-size: 11px; color: #999; height: 14px; margin-bottom: 8px; }
        .error-msg { display: none; color: #f44336; text-align: center; font-size: 12px; margin-bottom: 8px; }

        .keypad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 14px; }
        .key {
          background: var(--secondary-background-color, #f0f0f0); border: none; border-radius: 10px;
          padding: 14px 0; font-size: 18px; font-weight: 600; cursor: pointer;
          transition: all 0.15s ease; color: var(--primary-text-color, #212121);
        }
        .key:hover { background: var(--primary-color, #03a9f4); color: white; }
        .key:active { transform: scale(0.92); }
        .key-clear { background: #f44336; color: white; font-size: 13px; }
        .key-clear:hover { background: #d32f2f; }

        .arm-section, .disarm-section { display: flex; gap: 8px; margin-bottom: 14px; }
        .arm-btn {
          flex: 1; border: none; border-radius: 10px; padding: 12px;
          font-size: 13px; font-weight: 600; cursor: pointer; color: white; transition: all 0.15s ease;
        }
        .arm-btn:active { transform: scale(0.95); }
        .arm-btn-stay { background: #2e7d32; }
        .arm-btn-stay:hover { background: #1b5e20; }
        .arm-btn-away { background: #1565c0; }
        .arm-btn-away:hover { background: #0d47a1; }
        .arm-btn-disarm { background: #e65100; }
        .arm-btn-disarm:hover { background: #bf360c; }

        .zones-section { border-top: 1px solid var(--divider-color, #eee); padding-top: 12px; }
        .zones-title { font-size: 11px; font-weight: 600; color: var(--secondary-text-color, #999); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; }
        .zone-item { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .zone-name { font-size: 13px; color: var(--primary-text-color, #333); }
        .zone-open { color: #f44336; font-weight: 500; }
        .switch { position: relative; display: inline-block; width: 36px; height: 20px; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .slider-toggle {
          position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
          background-color: #ddd; transition: .3s; border-radius: 20px;
        }
        .slider-toggle:before {
          position: absolute; content: ""; height: 14px; width: 14px;
          left: 3px; bottom: 3px; background-color: white; transition: .3s; border-radius: 50%;
        }
        input:checked + .slider-toggle { background-color: #f44336; }
        input:checked + .slider-toggle:before { transform: translateX(16px); }
      </style>

      <div class="card">
        <div class="header">
          <div class="status-dot disarmed"></div>
          <span class="header-title">${title}</span>
          <span class="status-text">Abierta</span>
        </div>

        <div class="display">
          <div class="display-text">---</div>
        </div>
        <div class="code-hint"></div>

        <div class="error-msg"></div>

        <div class="keypad">
          <button class="key" data-key="1">1</button>
          <button class="key" data-key="2">2</button>
          <button class="key" data-key="3">3</button>
          <button class="key" data-key="4">4</button>
          <button class="key" data-key="5">5</button>
          <button class="key" data-key="6">6</button>
          <button class="key" data-key="7">7</button>
          <button class="key" data-key="8">8</button>
          <button class="key" data-key="9">9</button>
          <button class="key key-clear" data-key="clear">C</button>
          <button class="key" data-key="0">0</button>
          <button class="key" data-key="enter" style="visibility:hidden"></button>
        </div>

        <div class="arm-section" style="display:none">
          <button class="arm-btn arm-btn-stay" data-action="alarm_arm_home">Estancia</button>
          <button class="arm-btn arm-btn-away" data-action="alarm_arm_away">Salida</button>
        </div>

        <div class="disarm-section" style="display:none">
          <button class="arm-btn arm-btn-disarm" data-action="disarm">Desarmar</button>
        </div>

        <div class="zones-section">
          <div class="zones-title">Bypass</div>
          <div class="zones-list"></div>
        </div>
      </div>
    `;

    this.addEventListeners();
    this.updateZones();
  }

  updateZones() {
    const zones = this._getAllZones();
    const list = this.shadowRoot.querySelector('.zones-list');
    if (!list) return;

    list.innerHTML = zones.map(zone => {
      const state = this._hass?.states[zone.entity];
      const isOn = state && state.state === 'on';
      return `
        <div class="zone-item">
          <span class="zone-name ${isOn ? 'zone-open' : ''}">${zone.name}</span>
          <label class="switch">
            <input type="checkbox" data-zone="${zone.entity}">
            <span class="slider-toggle"></span>
          </label>
        </div>
      `;
    }).join('');
  }

  addEventListeners() {
    this.shadowRoot.querySelectorAll('.key').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleKeyPress(e.target.dataset.key));
    });

    this.shadowRoot.querySelectorAll('.arm-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        if (action === 'disarm') this.handleDisarm();
        else this.handleArmAction(action);
      });
    });

    this.shadowRoot.querySelectorAll('[data-zone]').forEach(input => {
      input.addEventListener('change', (e) => this.handleBypassToggle(e.target.dataset.zone));
    });
  }
}

customElements.define('custom-alarmdecoder-card', CustomAlarmdecoderCard);

class CustomAlarmdecoderCardEditor extends HTMLElement {
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  setConfig(config) { this._config = config; this.render(); }
  render() {
    this.shadowRoot.innerHTML = `
      <style>
        .editor { padding: 8px; }
        .field { margin-bottom: 12px; }
        .field label { display: block; font-size: 12px; font-weight: 500; margin-bottom: 4px; color: #757575; }
        .field input { width: 100%; padding: 8px; border: 1px solid #e0e0e0; border-radius: 4px; font-size: 14px; box-sizing: border-box; }
        h3 { margin: 0 0 12px 0; font-size: 14px; }
      </style>
      <div class="editor">
        <h3>Alarm Panel Config</h3>
        <div class="field"><label>Entity</label><input id="entity" value="${this._config?.entity || ''}"></div>
        <div class="field"><label>Display Entity</label><input id="display_entity" value="${this._config?.display_entity || ''}"></div>
        <div class="field"><label>Title</label><input id="title" value="${this._config?.title || ''}"></div>
      </div>
    `;
    this.shadowRoot.querySelectorAll('input').forEach(el => {
      el.addEventListener('change', () => this.updateConfig());
    });
  }
  updateConfig() {
    const config = {
      entity: this.shadowRoot.querySelector('#entity').value,
      display_entity: this.shadowRoot.querySelector('#display_entity').value,
      title: this.shadowRoot.querySelector('#title').value
    };
    this.dispatchEvent(new CustomEvent('config-changed', { detail: { config } }));
  }
}

customElements.define('custom-alarmdecoder-card-editor', CustomAlarmdecoderCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({ type: 'custom-alarmdecoder-card', name: 'Custom AlarmDecoder Card', description: 'Minimalist alarm panel with bypass for AlarmDecoder' });
