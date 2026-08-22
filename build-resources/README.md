# JARVIS Brain — Build Resources

This folder contains icons used by electron-builder to create native installers.

## Required files

| File | Platform | Size |
|------|----------|------|
| `icon.ico` | Windows | Multi-size ICO (256×256 recommended) |
| `icon.png` | Linux | 512×512 PNG |
| `icon.icns` | macOS | ICNS bundle |
| `dmg-background.png` | macOS DMG | 660×400 PNG (optional) |

## Quick way to generate from the SVG

Install `sharp-cli` or use any online converter:

```bash
# npm-based (cross-platform)
npx sharp-cli resize 512 512 --input icon.svg --output icon.png
npx png-to-ico icon.png > icon.ico

# Or just use https://www.icoconverter.com / https://cloudconvert.com/svg-to-icns
```

## Placeholder behaviour

If the icon files are missing, electron-builder will use the default Electron icon.
The app will still build and run — icons are cosmetic only.
