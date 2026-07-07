import { html, LitElement } from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class CustomAlarmdecoderCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._code = '';
    this._config = null;
    this._hass = null;
    this._bypassEntities = [];
    this._entitiesFetched = false;
  }

  static getConfigElement() {
    return document.createElement('alarm-panel-card-editor');
  }

  static getStubConfig() {
    return { entity: '', display_entity: '', title: 'Alarma' };
  }

  setConfig(config) {
    this._config = config;
    this._renderCard();
    if (this._hass) this._fetchEntities();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._entitiesFetched) this._fetchEntities();
    this._updateDisplay();
  }

  get hass() { return this._hass; }
  getCardSize() { return 4; }

  async _fetchEntities() {
    if (!this._hass || this._entitiesFetched) return;
    this._entitiesFetched = true;
    try {
      const entities = await this._hass.connection.sendMessagePromise({
        type: 'config/entity_registry/list'
      });
      const bypass = [];
      entities.forEach(entry => {
        if (entry.integration !== 'custom_alarmdecoder') return;
        if (entry.entity_id.startsWith('switch.') && entry.entity_id.includes('_bypass')) {
          bypass.push({
            entity_id: entry.entity_id,
            name: entry.name || entry.original_name || entry.entity_id
          });
        }
      });
      this._bypassEntities = bypass;
    } catch (e) {
      console.warn('Entity registry fetch failed:', e);
    }

    if (this._bypassEntities.length === 0) {
      Object.keys(this._hass.states).forEach(eid => {
        if (!eid.startsWith('switch.') || !eid.includes('_bypass')) return;
        const s = this._hass.states[eid];
        if (!s) return;
        const uid = s.attributes?.unique_id || '';
        if (uid.includes('custom_alarmdecoder') || eid.includes('alarm_decoder')) {
          this._bypassEntities.push({
            entity_id: eid,
            name: s.attributes?.zone_name || s.attributes?.friendly_name || eid
          });
        }
      });
    }

    this._renderBypass();
  }

  _updateDisplay() {
    if (!this._hass || !this._config) return;
    const alarm = this._hass.states[this._config.entity];
    if (!alarm) return;

    const state = alarm.state;
    const card = this.shadowRoot.querySelector('.card');
    const dot = this.shadowRoot.querySelector('.status-dot');
    const txt = this.shadowRoot.querySelector('.status-text');
    const disp = this.shadowRoot.querySelector('.display-text');
    const arm = this.shadowRoot.querySelector('.arm-section');
    const disarm = this.shadowRoot.querySelector('.disarm-section');
    const hint = this.shadowRoot.querySelector('.code-hint');

    if (card) {
      card.classList.remove('arming', 'armed', 'triggered');
      if (state === 'pending') card.classList.add('arming');
      else if (state === 'armed_away' || state === 'armed_home') card.classList.add('armed');
      else if (state === 'triggered') card.classList.add('triggered');
    }

    if (dot) dot.className = 'status-dot ' + state;
    if (txt) {
      const labels = { disarmed: 'Desarmada', armed_away: 'Armada', armed_home: 'Noche', pending: 'Armando...', triggered: 'ALARMA' };
      txt.textContent = labels[state] || state;
    }
    if (disp) {
      disp.textContent = this._code ? '*'.repeat(this._code.length) : '---';
    }
    const lcd = this.shadowRoot.querySelector('.lcd-text');
    if (lcd) {
      if (this._config.display_entity) {
        const ds = this._hass.states[this._config.display_entity];
        lcd.textContent = (ds && ds.state && ds.state !== 'unavailable') ? ds.state : '';
      } else {
        lcd.textContent = '';
      }
    }
    if (arm) arm.style.display = state === 'disarmed' ? 'flex' : 'none';
    if (disarm) disarm.style.display = state !== 'disarmed' ? 'flex' : 'none';
    if (hint) hint.textContent = this._code.length > 0 ? this._code.length + ' dígitos' : '';

    this._bypassEntities.forEach(z => {
      const sw = this.shadowRoot.querySelector('[data-zone="' + z.entity_id + '"]');
      if (sw && this._hass.states[z.entity_id]) {
        sw.checked = this._hass.states[z.entity_id].state === 'on';
      }
    });
  }

  _renderBypass() {
    if (!this._hass) return;
    const list = this.shadowRoot.querySelector('.zones-list');
    if (!list) return;

    let zones = this._bypassEntities;
    if (zones.length === 0) {
      Object.keys(this._hass.states).forEach(eid => {
        if (!eid.startsWith('switch.') || !eid.includes('_bypass')) return;
        const s = this._hass.states[eid];
        if (!s || s.attributes?.marked_for_bypass === undefined) return;
        zones.push({ entity_id: eid, name: s.attributes.zone_name || s.attributes.friendly_name || eid });
      });
    }

    list.innerHTML = zones.map(z => {
      const s = this._hass.states[z.entity_id];
      const on = s && s.state === 'on';
      const name = s?.attributes?.zone_name || z.name;
      return '<div class="zone-item"><span class="zone-name' + (on ? ' zone-open' : '') + '">' + name + '</span><label class="switch"><input type="checkbox" data-zone="' + z.entity_id + '"' + (on ? ' checked' : '') + '><span class="slider-toggle"></span></label></div>';
    }).join('');

    list.querySelectorAll('[data-zone]').forEach(el => {
      el.addEventListener('change', e => {
        this._hass.callService('homeassistant', 'toggle', { entity_id: e.target.dataset.zone });
      });
    });
  }

  handleKeyPress(key) {
    this._code = key === 'clear' ? '' : (this._code.length < 8 ? this._code + key : this._code);
    this._updateDisplay();
  }

  handleArmAction(action) {
    if (!this._hass || !this._config) return;
    if (!this._code) { this.showError('Ingrese código'); return; }
    this._hass.callService('alarm_control_panel', action, {
      entity_id: this._config.entity, code: this._code
    });
    this._code = '';
    this._updateDisplay();
  }

  handleDisarm() {
    if (!this._hass || !this._config) return;
    if (!this._code) { this.showError('Ingrese código'); return; }
    this._hass.callService('alarm_control_panel', 'alarm_disarm', {
      entity_id: this._config.entity, code: this._code
    });
    this._code = '';
    this._updateDisplay();
  }

  showError(msg) {
    const el = this.shadowRoot.querySelector('.error-msg');
    if (el) {
      el.textContent = msg;
      el.style.display = 'block';
      setTimeout(() => { el.style.display = 'none'; }, 2000);
    }
  }

  _renderCard() {
    if (!this._config) return;
    const title = this._config.title || 'Alarma';

    this.shadowRoot.innerHTML = '<style>' +
      ':host{display:block}' +
      '.card{background:var(--card-background-color,#fff);border-radius:var(--border-radius,16px);box-shadow:var(--box-shadow,0 2px 8px rgba(0,0,0,.08));padding:20px;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif}' +
      '.header{display:flex;align-items:center;gap:10px;margin-bottom:16px}' +
      '.header-title{font-size:15px;font-weight:600;color:var(--primary-text-color,#212121);flex:1}' +
      '.status-dot{width:10px;height:10px;border-radius:50%;transition:all .3s ease}' +
      '.status-dot.disarmed{background:#4caf50;box-shadow:0 0 8px #4caf50}' +
      '.status-dot.armed_away,.status-dot.armed_home{background:#ff9800;box-shadow:0 0 8px #ff9800}' +
      '.status-dot.pending{background:#2196f3;animation:pulse 1s infinite}' +
      '.status-dot.triggered{background:#f44336;animation:blink .5s infinite}' +
      '.status-text{font-size:13px;color:var(--secondary-text-color,#757575)}' +
      '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}' +
      '@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}' +
      '.display{background:#111;border-radius:10px;padding:14px;margin-bottom:6px;text-align:center;position:relative;overflow:hidden;transition:box-shadow .3s}' +
      '.display-text{font-family:SF Mono,monospace;font-size:18px;color:#00ff88;letter-spacing:3px;min-height:24px}' +
      '.lcd-text{font-family:SF Mono,monospace;font-size:13px;color:#ffeb3b;letter-spacing:2px;min-height:18px;margin-top:4px}' +
      '.arming .display{box-shadow:0 0 20px rgba(33,150,243,.6)}' +
      '.arming .display::after{content:"";position:absolute;top:0;left:-100%;width:100%;height:100%;background:linear-gradient(90deg,transparent,rgba(33,150,243,.3),transparent);animation:sweep 1.2s infinite}' +
      '.triggered .display{box-shadow:0 0 30px rgba(244,67,54,.8);animation:flash-border .5s infinite}' +
      '@keyframes sweep{0%{left:-100%}100%{left:100%}}' +
      '@keyframes flash-border{0%,100%{box-shadow:0 0 20px rgba(244,67,54,.4)}50%{box-shadow:0 0 40px rgba(244,67,54,.9)}}' +
      '.armed .display{box-shadow:0 0 15px rgba(255,152,0,.4)}' +
      '.code-hint{text-align:right;font-size:11px;color:#999;height:14px;margin-bottom:8px}' +
      '.error-msg{display:none;color:#f44336;text-align:center;font-size:12px;margin-bottom:8px}' +
      '.keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:14px}' +
      '.key{background:var(--secondary-background-color,#f0f0f0);border:none;border-radius:10px;padding:14px 0;font-size:18px;font-weight:600;cursor:pointer;transition:all .15s ease;color:var(--primary-text-color,#212121)}' +
      '.key:hover{background:var(--primary-color,#03a9f4);color:#fff}' +
      '.key:active{transform:scale(.92)}' +
      '.key-clear{background:#f44336;color:#fff;font-size:13px}' +
      '.key-clear:hover{background:#d32f2f}' +
      '.arm-section,.disarm-section{display:flex;gap:8px;margin-bottom:14px}' +
      '.arm-btn{flex:1;border:none;border-radius:10px;padding:12px;font-size:13px;font-weight:600;cursor:pointer;color:#fff;transition:all .15s ease}' +
      '.arm-btn:active{transform:scale(.95)}' +
      '.arm-btn-stay{background:#2e7d32}.arm-btn-stay:hover{background:#1b5e20}' +
      '.arm-btn-away{background:#1565c0}.arm-btn-away:hover{background:#0d47a1}' +
      '.arm-btn-disarm{background:#e65100}.arm-btn-disarm:hover{background:#bf360c}' +
      '.zones-section{border-top:1px solid var(--divider-color,#eee);padding-top:12px}' +
      '.zones-title{font-size:11px;font-weight:600;color:var(--secondary-text-color,#999);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}' +
      '.zone-item{display:flex;align-items:center;justify-content:space-between;padding:6px 0}' +
      '.zone-name{font-size:13px;color:var(--primary-text-color,#333)}' +
      '.zone-open{color:#f44336;font-weight:500}' +
      '.switch{position:relative;display:inline-block;width:36px;height:20px}' +
      '.switch input{opacity:0;width:0;height:0}' +
      '.slider-toggle{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background-color:#ddd;transition:.3s;border-radius:20px}' +
      '.slider-toggle:before{position:absolute;content:"";height:14px;width:14px;left:3px;bottom:3px;background-color:#fff;transition:.3s;border-radius:50%}' +
      'input:checked+.slider-toggle{background-color:#f44336}' +
      'input:checked+.slider-toggle:before{transform:translateX(16px)}' +
      '</style>' +
      '<div class="card">' +
        '<div class="header"><div class="status-dot disarmed"></div><span class="header-title">' + title + '</span><span class="status-text">Desarmada</span></div>' +
        '<div class="display"><div class="display-text">---</div><div class="lcd-text"></div></div>' +
        '<div class="code-hint"></div>' +
        '<div class="error-msg"></div>' +
        '<div class="keypad">' +
          '<button class="key" data-key="1">1</button><button class="key" data-key="2">2</button><button class="key" data-key="3">3</button>' +
          '<button class="key" data-key="4">4</button><button class="key" data-key="5">5</button><button class="key" data-key="6">6</button>' +
          '<button class="key" data-key="7">7</button><button class="key" data-key="8">8</button><button class="key" data-key="9">9</button>' +
          '<button class="key key-clear" data-key="clear">C</button><button class="key" data-key="0">0</button><button class="key" data-key="enter" style="visibility:hidden"></button>' +
        '</div>' +
        '<div class="arm-section" style="display:none"><button class="arm-btn arm-btn-stay" data-action="alarm_arm_home">Noche</button><button class="arm-btn arm-btn-away" data-action="alarm_arm_away">Salida</button></div>' +
        '<div class="disarm-section" style="display:none"><button class="arm-btn arm-btn-disarm" data-action="disarm">Desarmar</button></div>' +
        '<div class="zones-section"><div class="zones-title">Bypass</div><div class="zones-list"></div></div>' +
      '</div>';

    this.shadowRoot.querySelectorAll('.key').forEach(b => {
      b.addEventListener('click', e => this.handleKeyPress(e.target.dataset.key));
    });
    this.shadowRoot.querySelectorAll('.arm-btn').forEach(b => {
      b.addEventListener('click', e => {
        const a = e.target.dataset.action;
        a === 'disarm' ? this.handleDisarm() : this.handleArmAction(a);
      });
    });

    this._renderBypass();
    if (this._hass) this._updateDisplay();
  }
}

customElements.define('custom-alarmdecoder-card', CustomAlarmdecoderCard);


class CustomAlarmdecoderCardEditor extends LitElement {
  static get properties() {
    return {
      hass: {},
      _config: {},
    };
  }

  setConfig(config) {
    this._config = config;
  }

  _entityChanged(ev, key) {
    const _config = Object.assign({}, this._config);
    _config[key] = ev.target.value;
    this._config = _config;
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: _config },
      bubbles: true,
      composed: true,
    }));
  }

  render() {
    if (!this.hass || !this._config) {
      return html``;
    }

    const alarmEntities = Object.keys(this.hass.states)
      .filter(eid => eid.split(".")[0] === "alarm_control_panel")
      .map(eid => {
        const st = this.hass.states[eid];
        return html`<option value="${eid}" ?selected=${this._config.entity === eid}>${st?.attributes?.friendly_name || eid}</option>`;
      });

    const sensorEntities = Object.keys(this.hass.states)
      .filter(eid => eid.split(".")[0] === "sensor")
      .map(eid => {
        const st = this.hass.states[eid];
        return html`<option value="${eid}" ?selected=${this._config.display_entity === eid}>${st?.attributes?.friendly_name || eid}</option>`;
      });

    const bypassEntities = Object.keys(this.hass.states)
      .filter(eid => eid.split(".")[0] === "switch" && eid.includes("_bypass") && this.hass.states[eid]?.attributes?.marked_for_bypass !== undefined)
      .map(eid => {
        const st = this.hass.states[eid];
        const name = st?.attributes?.zone_name || st?.attributes?.friendly_name || eid;
        const isOn = st?.state === "on";
        return html`
          <div class="bypass-row">
            <span class="bypass-name">${name}</span>
            <span class="bypass-state">${isOn ? "ON" : "OFF"}</span>
          </div>
        `;
      });

    return html`
      <style>
        .ed { padding: 8px; }
        .f { margin-bottom: 16px; }
        .f label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 4px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
        .f select { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; background: #fafafa; }
        .f select:focus { border-color: #2196f3; outline: none; background: #fff; }
        .f input[type="text"] { width: 100%; padding: 8px 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; box-sizing: border-box; background: #fafafa; }
        .f input[type="text"]:focus { border-color: #2196f3; outline: none; background: #fff; }
        .hint { font-size: 11px; color: #999; margin-top: 4px; }
        .cnt { display: inline-block; background: #2196f3; color: #fff; border-radius: 8px; padding: 0 5px; font-size: 10px; margin-left: 4px; }
        h3 { margin: 0 0 12px; font-size: 14px; font-weight: 600; }
        .bypass-list { border: 1px solid #e0e0e0; border-radius: 6px; max-height: 150px; overflow-y: auto; margin-top: 4px; }
        .bypass-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; border-bottom: 1px solid #f0f0f0; font-size: 12px; }
        .bypass-row:last-child { border-bottom: none; }
        .bypass-name { color: #333; }
        .bypass-state { font-size: 10px; color: #999; background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
      </style>

      <div class="ed">
        <h3>Alarm Panel Config</h3>

        <div class="f">
          <label>Panel de Alarma <span class="cnt">${alarmEntities.length}</span></label>
          <select @change=${(e) => this._entityChanged(e, "entity")}>
            <option value="">-- Seleccionar --</option>
            ${alarmEntities}
          </select>
          <div class="hint">Entidad alarm_control_panel de custom_alarmdecoder</div>
        </div>

        <div class="f">
          <label>Entidad de Display <span class="cnt">${sensorEntities.length}</span></label>
          <select @change=${(e) => this._entityChanged(e, "display_entity")}>
            <option value="">(ninguno)</option>
            ${sensorEntities}
          </select>
          <div class="hint">Sensor con el texto del teclado</div>
        </div>

        <div class="f">
          <label>Título</label>
          <input type="text" .value=${this._config.title || ""} @input=${(e) => this._entityChanged(e, "title")}>
        </div>

        <div class="f">
          <label>Bypass <span class="cnt">${bypassEntities.length}</span></label>
          <div class="bypass-list">
            ${bypassEntities.length > 0 ? bypassEntities : html`<div class="hint">No se encontraron entidades de bypass</div>`}
          </div>
          <div class="hint">Se cargan automáticamente de custom_alarmdecoder</div>
        </div>
      </div>
    `;
  }
}

customElements.define("custom-alarmdecoder-card-editor", CustomAlarmdecoderCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({ type: "custom-alarmdecoder-card", name: "Custom AlarmDecoder Card", description: "Minimalist alarm panel with bypass for AlarmDecoder" });
