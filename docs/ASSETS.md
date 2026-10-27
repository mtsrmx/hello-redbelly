# Assets and licences

Everything in the film is either original work made for this entry or official Redbelly brand material. There is no stock footage, no stock photography, no third-party music and no AI-generated imagery.

| File | What it is | Source | Licence or permission |
|---|---|---|---|
| `composition/assets/fonts/ReadexPro-VF.ttf` | Readex Pro variable font (weights 160 to 700), the brand typeface | [Google Fonts](https://fonts.google.com/specimen/Readex+Pro), linked from [redbelly.network/brand](https://redbelly.network/brand) | SIL Open Font License 1.1, see `OFL.txt` |
| `composition/assets/fonts/OFL.txt` | Licence text that ships with Readex Pro | [google/fonts](https://github.com/google/fonts/tree/main/ofl/readexpro) | SIL Open Font License 1.1 |
| `composition/assets/brand/brand-horizontal-negative.svg` | Horizontal logo lockup, negative version (logo reveal, review site header, PDF cover) | Official Redbelly brand pack, [redbelly.network/brand](https://redbelly.network/brand) | Redbelly brand asset, used unaltered and as the brand guidelines describe |
| `composition/assets/brand/brand-vertical-negative.svg` | Vertical logo lockup, negative version (end card) | Official Redbelly brand pack | Redbelly brand asset, used unaltered |
| `composition/assets/brand/isotype-white.svg` | Isotype in white (centre of the network scene) | Official Redbelly brand pack | Redbelly brand asset, used unaltered |
| `composition/assets/brand/isotype-red.svg` | Isotype in red (digital ownership card, public network tile, favicon) | Official Redbelly brand pack | Redbelly brand asset, used unaltered |
| `composition/assets/brand/official-hashes.json` | SHA-256 of each logo file as it comes in the brand pack | Generated for this repository | Original |
| `composition/assets/audio/soundtrack.m4a` | Music and sound effects | Synthesised by [`audio/compose.py`](../audio/compose.py) from sine waves, band-limited saw waves and filtered noise | Original, no samples or loops |
| `composition/js/icons.js` | Line icons (phone, passport, building, leaf and others) | Drawn as SVG paths for this film | Original |
| `composition/js/*` and `composition/styles.css` | Animation engine, scenes and styles | Written for this film | Original |

## How the logos are used

The Redbelly brand guidelines ask for the logo to keep its proportions and clear space, to stay legible against its background, and to use only the versions supplied in the brand pack. The film follows that:

- The logo files are byte-for-byte the files in the brand pack. `tools/verify.mjs` re-hashes them against `official-hashes.json`.
- The logo reveal draws a hexagon over the isotype's outline and then shows the official artwork with a clip wipe. The finished lockup is the untouched official file at its own proportions.
- Logos only appear on the dark brand slate (#283A46 to #142530), with the negative versions made for dark backgrounds.

## Brand colours and type used

| Token | Hex | Brand role |
|---|---|---|
| `--red` | #FF5050 | Main brand red |
| `--slate` | #283A46 | Main brand grey |
| `--red-deep` | #FA423C | Secondary |
| `--navy` | #142530 | Secondary |
| `--grey` | #848B91 | Secondary |
| `--silver` | #D9D9D9 | Secondary |
| `--paper` | #ECEBEC | Secondary |

Headlines are Readex Pro Medium in white and #FF5050 on dark backgrounds, and body text is Readex Pro Regular, as the brand guidelines specify.
