# Custom AlarmDecoder Card for Home Assistant

A minimalist alarm panel card for Home Assistant with zone bypass support, designed for use with the [Custom AlarmDecoder integration](https://github.com/SantiagoSotoC/ha_custom_components).

## Features

- **Alarm Control**: Arm away, arm home (stay), and disarm
- **Zone Bypass**: Toggle bypass for individual zones directly from the card
- **Auto-Detect Bypass Entities**: Automatically loads bypass switches from Custom AlarmDecoder
- **Display Support**: Show alarm code input or external display entity (LCD line)
- **Visual Status**: Color-coded status indicator with animated effects
- **Smart Editor**: Visual editor with entity dropdowns for easy configuration

## Visual Effects

- **Arming**: Blue sweep animation on display
- **Armed**: Orange glow on display
- **Triggered**: Red flashing border effect

## Installation

### HACS (Recommended)
1. Open HACS in Home Assistant
2. Go to Frontend section
3. Click the "+" button and search for "Custom AlarmDecoder Card"
4. Install the card
5. Refresh your browser

### Manual
1. Download `custom-alarmdecoder-card.js` from the latest release
2. Copy it to your `config/www/` directory
3. Add the following to your `configuration.yaml`:
   ```yaml
   frontend:
     extra_module_url:
       - /local/custom-alarmdecoder-card.js
   ```
4. Restart Home Assistant

## Configuration

### Basic Setup
```yaml
type: custom:custom-alarmdecoder-card
entity: alarm_control_panel.alarmdecoder
title: My Alarm
```

### With Display Entity
```yaml
type: custom:custom-alarmdecoder-card
entity: alarm_control_panel.alarmdecoder
display_entity: sensor.keypad_display
title: My Alarm
```

### Options
| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `entity` | string | Yes | Alarm control panel entity ID |
| `display_entity` | string | No | Sensor entity to show on LCD display |
| `title` | string | No | Card title (default: "Alarma") |

## Usage

1. **Enter Code**: Use the numeric keypad to enter your alarm code
2. **Arm Away**: Press "Salida" button after entering code
3. **Arm Home**: Press "Noche" button after entering code
4. **Disarm**: Press "Desarmar" button after entering code
5. **Bypass Zones**: Toggle the switch next to any zone to bypass it

## Editor

The card includes a visual editor that:
- Shows dropdown selectors for alarm and display entities
- Automatically detects bypass entities from Custom AlarmDecoder
- Displays entity counts and hints for each field

## Compatibility

- Requires [Custom AlarmDecoder](https://github.com/SantiagoSotoC/ha_custom_components) integration
- Uses LitElement 2.4.0 for the editor component

## License

Apache License 2.0
