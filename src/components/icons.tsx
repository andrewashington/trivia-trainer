/**
 * Pixel icons inlined from \"pixelarticons\" (MIT, halfmage/pixelarticons) plus
 * filled variants from the Pixelarticons Pro pack vendored at
 * vendor/pixelarticons-pro. 24x24 grid, fill-based — chunky at any size.
 * Add an icon: `node scripts/icon.mjs <name>` and paste the output here.
 */
export type IconName = keyof typeof PATHS;

const PATHS = {
  "downasaur": "M14 23H4v-2h8v-2h2v4ZM4 21H2V7h2v14Zm14-2h-4v-2h4v2Zm2-2h-2v-2h-4v-2h6v4Zm-6-4h-2v-2h2v2Zm8-2h-8V9h6V5h2v6Zm-12-1H8V8h2v2ZM6 7H4V5h2v2Zm14-2H6V3h14v2Z",
  "apple": "M11 8h3v2h-3zm3-2h4v2h-4zm4 2h2v3h-2zm-2 3h2v4h-2zm2 4h2v5h-2zm-4 5h4v2h-4zm-3-2h3v2h-3zm-4 2h4v2H7zm-2-2h2v2H5zm-2-8h2v8H3zm2-2h2v2H5zm2-2h4v2H7zm5-3h2v2h-2zm2-2h2v2h-2z",
  "circle-question": "M18 22H6V20H18V22ZM6 20H4V18H6V20ZM20 20H18V18H20V20ZM4 18H2V6H4V18ZM13 18H11V16H13V18ZM22 18H20V6H22V18ZM15 13H13V15H11V11H15V13ZM17 11H15V8H17V11ZM9 10H7V8H9V10ZM15 8H9V6H15V8ZM6 6H4V4H6V6ZM20 6H18V4H20V6ZM18 4H6V2H18V4Z",
  "bullseye-arrow": "M18 22H6v-2h12v2ZM6 20H4v-2h2v2Zm14 0h-2v-2h2v2ZM4 18H2V6h2v12Zm12 0H8v-2h8v2Zm6 0h-2V8h2v10ZM8 16H6V8h2v8Zm10 0h-2v-4h2v4Zm-4-2h-4v-4h4v4Zm2-4h-2V8h2v2Zm-4-2H8V6h4v2Zm6 0h-2V6h2v2ZM6 6H4V4h2v2Zm14-2h2v2h-4V2h2v2Zm-4 0H6V2h10v2Z",
  "home":"M4 20h16v2H4zm16-10h2v10h-2zM2 10h2v10H2zm2-2h2v2H4zm2-2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4zm4 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM8 14h2v6H8zm2-2h4v2h-4zm4 2h2v6h-2z",
  "calendar": "M5 4h14v2H5zm0 16h14v2H5zM3 10h2v10H3zm0-4h2v2H3zm16 0h2v2h-2zm0 4h2v10h-2zM3 8h18v2H3zm12-6h2v2h-2zM7 2h2v2H7z",
  "map-pin": "M7 2h10v2H7zM5 4h2v2H5zm14 0h-2v2h2zM7 17h2v2H7zm2 2h2v2H9zm6-2h2v2h-2zm-2 2h2v2h-2zm-2 2h2v2h-2zm-6-7h2v3H5zm12 0h2v3h-2zM3 6h2v8H3zm18 0h-2v8h2zM10 6h4v2h-4zM8 8h2v4H8zm2 4h4v2h-4zm4-4h2v4h-2z",
  "chart-bar-big": "M4 20h18v2H4zM2 2h2v18H2zm16 11v3h-2v-3zM8 13v3H6v-3zm8-2v2H8v-2zm0 5v2H8v-2zm4-12v3h-2V4zM8 4v3H6V4zm10-2v2H8V2zm0 5v2H8V7z",
  "lightbulb": "M9 4h6v2H9zM7 6h2v2H7zm8 0h2v2h-2zm4-2h2v2h-2zm2-2h2v2h-2zM0 10h3v2H0zm21 0h3v2h-3zM3 4h2v2H3zM1 2h2v2H1zm6 12h2v2H7zm8 0h2v2h-2zM5 8h2v6H5zm12 0h2v6h-2zm-8 8h6v2H9zm0 4h6v2H9zm0-2h2v2H9zm4 0h2v2h-2zM11 0h2v3h-2z",
  "book-open": "M2 3h9v2H2zM0 19h11v2H0zM13 3h9v2h-9zm0 16h11v2H13zM11 5h2v18h-2zM0 5h2v14H0zm22 0h2v14h-2zm-7 2h5v2h-5zm0 4h5v2h-5zm0 4h2v2h-2z",
  "tv": "M4 3h16v2H4zM2 5h2v10H2zm2 10h16v2H4zM20 5h2v10h-2zM6 19h12v2H6zm3-2h2v2H9zm4 0h2v2h-2z",
  "folder": "M4 4h6v2H4zm0 14h16v2H4zM20 8h2v10h-2zM2 6h2v12H2zm8 0h10v2H10z",
  "gift": "M4 6h16v2H4zM2 8h2v4H2zm2 4h16v2H4zm16-4h2v4h-2zM6 4h2v2H6zm2-2h3v2H8zm3 2h2v2h-2zm2-2h3v2h-3zm3 2h2v2h-2zM4 14h2v6H4zm2 6h12v2H6zm12-6h2v6h-2zm-7-6h2v4h-2zm0 6h2v6h-2z",
  "store": "M3 13h2v8H3zm2 8h14v2H5zm14-8h2v8h-2zm-9-2h4v2h-4zm4-2h4v2h-4zm4 2h4v2h-4zM6 9h4v2H6zm-4 2h4v2H2zM0 7h2v4H0zm2-2h2v2H2zm18 0h2v2h-2zm2 2h2v4h-2zM4 3h16v2H4zm6 12h4v2h-4zm-2 2h2v4H8zm6 0h2v4h-2z",
  "lock": "M5 8h14v2H5zm0 12h14v2H5zM3 10h2v10H3zm16 0h2v10h-2zM7 4h2v4H7zm2-2h6v2H9zm6 2h2v4h-2z",
  "contact": "M2 2h20v2H2zM0 4h2v16H0zm22 0h2v16h-2zM2 20h20v2H2zM14 7h6v2h-6zm0 4h6v2h-6zm0 4h4v2h-4zM6 7h4v4H6zm0 6h4v2H6zm4 2h2v2h-2zm-6 0h2v2H4z",
  "robot-face-happy": "M4 6h16v2H4zm0 14h16v2H4zM2 8h2v12H2zm18 0h2v12h-2z M11 4h2v4h-2zm-3 6h2v2H8zm6 0h2v2h-2zm-1-8h4v2h-4zM0 12h2v2H0zm22 0h2v2h-2zM7 14h10v2H7zm2 2h6v2H9z",
  "eye": "M16 20H8v-2h8v2Zm-8-2H4v-2h4v2Zm12 0h-4v-2h4v2ZM4 16H2v-2h2v2Zm10-6h-2v2h2v-2h2v4h-2v2h-4v-2H8v-4h2V8h4v2Zm8 6h-2v-2h2v2ZM2 14H0v-4h2v4Zm22 0h-2v-4h2v4ZM4 10H2V8h2v2Zm18 0h-2V8h2v2ZM8 8H4V6h4v2Zm12 0h-4V6h4v2Zm-4-2H8V4h8v2Z",
  "target": "M5 1h14v2H5zM3 3h2v2H3zm0 16h2v2H3zm16 0h2v2h-2zm0-16h2v2h-2zm2 2h2v14h-2zM5 21h14v2H5zM1 5h2v14H1zm8 0h6v2H9zM5 9h2v6H5zm4 8h6v2H9zm8-8h2v6h-2zm-6 0h2v2h-2zM7 7h2v2H7zm0 8h2v2H7zm8 0h2v2h-2zm0-8h2v2h-2zm-6 4h2v2H9zm2 2h2v2h-2zm2-2h2v2h-2z",
  "settings-cog": "M9 0h6v2H9zm6 24H9v-2h6zM0 15V9h2v6zm24-6v6h-2V9zM9 2h2v4H9zm6 20h-2v-4h2zM2 15v-2h4v2zm20-6v2h-4V9zm-9-7h2v4h-2zm-2 20H9v-4h2zM2 11V9h4v2zm20 2v2h-4v-2zM7 4h2v2H7zm10 0h-2v2h2zm0 16h-2v-2h2zM7 20h2v-2H7zM2 2h5v2H2zm20 0h-5v2h5zm0 20h-5v-2h5zM2 22h5v-2H2z M2 2h2v5H2zm20 0h-2v5h2zm0 20h-2v-5h2zM2 22h2v-5H2zM4 7h2v2H4zm16 0h-2v2h2zm0 10h-2v-2h2zM4 17h2v-2H4zm6-9h4v2h-4zm0 6h4v2h-4zm-2-4h2v4H8zm6 0h2v4h-2z M0 0h24v24H0z",
  "sword": "M11 2h2v2h-2zM9 4h2v12H9zm4 0h2v12h-2zM7 16h10v2H7zm4 2h2v4h-2z",
  "library": "M3 4h2v17H3zm4 4h2v13H7zm4-2h2v15h-2zm4 0h2v5h-2zm2 5h2v5h-2zm2 5h2v5h-2z",
  "backpack": "M5 6h14v2H5zM3 8h2v12H3zm2 12h14v2H5zM19 8h2v12h-2z M7 16h2v6H7zm8 0h2v6h-2zm-6-2h6v2H9zm-2-4h10v2H7zm1-6h2v2H8zm6 0h2v2h-2zm-4-2h4v2h-4z",
  "gamepad": "M4 4h16v2H4zm0 14h16v2H4zM2 6h2v12H2zm18 0h2v12h-2zM8 9h2v6H8z M6 11h6v2H6zm8-2h2v2h-2zm2 4h2v2h-2z",
  "lightbulb-off": "M9 3h6v2H9zM7 5h2v2H7zm8 0h2v2h-2zm-8 8h2v2H7zm8 0h2v2h-2zM5 7h2v6H5zm12 0h2v6h-2zm-8 8h6v2H9zm0 4h6v2H9zm0-2h2v2H9zm4 0h2v2h-2z",
  "earth": "M6 2h12v2H6zm0 18h12v2H6zM18 4h2v2h-2zM4 18h2v2H4zM4 4h2v2H4zm14 14h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM8 4h2v4H8zm2 4h4v2h-4zm4 2h4v2h-4zm4-2h2v2h-2zM4 12h2v2H4zm6 4h2v4h-2zm-4-2h4v2H6zm8 2h2v4h-2zm2-2h4v2h-4z",
  "shopping-bag": "M3 6h18v2H3zm2 14h14v2H5zM3 8h2v12H3zm16 0h2v12h-2z M7 4h2v6H7zm2-2h6v2H9zm6 2h2v6h-2z",
  "reload": "M16 4h2v6h-2zm-2-2h2v2h-2zm0 2h2v8h-2zM4 8H2v5h2z M4 6h16v2H4zm4 14H6v-6h2zm2 2H8v-2h2zm0-2H8v-8h2zm10-4h2v-5h-2z M20 18H4v-2h16z",
  "star": "M5 20H8V22H3V16H5V20ZM21 22H16V20H19V16H21V22ZM10 20H8V18H10V20ZM16 20H14V18H16V20ZM14 18H10V16H14V18ZM7 16H5V13H7V16ZM19 16H17V13H19V16ZM5 13H3V11H5V13ZM21 13H19V11H21V13ZM9 9H3V11H1V7H9V9ZM23 11H21V9H15V7H23V11ZM11 7H9V3H11V7ZM15 7H13V3H15V7ZM13 3H11V1H13V3Z",
  "laugh": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 14h2v2H7zm0-2h10v2H7zm2 4h6v2H9zm6-2h2v2h-2zM8 8h2v2H8zm6 0h2v2h-2z",
  "smile": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 13h2v2H7zm2 2h6v2H9zm6-2h2v2h-2zM8 8h2v2H8zm6 0h2v2h-2z",
  "frown": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM8 8h2v2H8zm6 0h2v2h-2zm-7 7h2v2H7zm2-2h6v2H9zm6 2h2v2h-2z",
  "moon": "M18 22H8v-2h10v2ZM8 20H6v-2h2v2Zm12 0h-2v-2h2v2ZM6 18H4v-2h2v2Zm16 0h-2v-4h-2v-2h2v-2h2v8ZM4 16H2V6h2v10Zm14 0h-6v-2h6v2Zm-6-2h-2v-2h2v2Zm-2-2H8V6h2v6ZM6 6H4V4h2v2Zm8-2h-2v2h-2V4H6V2h8v2Z",
  "check": "M10 18H8v-2h2v2Zm-2-2H6v-2h2v2Zm4-2v2h-2v-2h2Zm-6 0H4v-2h2v2Zm8 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V8h2v2Zm2-2h-2V6h2v2Z",
  "heart": "M13 22h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8 0h-2v-2h2v2ZM7 16H5v-2h2v2Zm12 0h-2v-2h2v2ZM5 14H3v-2h2v2Zm16 0h-2v-2h2v2ZM3 12H1V6h2v6Zm20 0h-2V6h2v6ZM13 8h-2V6h2v2ZM5 6H3V4h2v2Zm6 0H9V4h2v2Zm4 0h-2V4h2v2Zm6 0h-2V4h2v2ZM9 4H5V2h4v2Zm10 0h-4V2h4v2Z",
  "megaphone": "M4 6h12v2H4zM2 8h2v6H2zm2 6h12v2H4zM20 2h2v18h-2zm-2 16h2v2h-2zm-2-2h2v2h-2zm0-12h2v2h-2zm2-2h2v2h-2zM8 8h2v6H8zm-2 8h2v4H6zm2 4h4v2H8zm2-4h2v4h-2z",
  "users": "M5 2h6v2H5zm10 0h4v2h-4zM5 10h6v2H5zm10 0h4v2h-4zm4-6h2v6h-2zm-8 0h2v6h-2zM3 4h2v6H3zM0 18h2v4H0zm14 0h2v4h-2zm8 0h2v4h-2zM4 14h8v2H4zm12 0h4v2h-4zM2 16h2v2H2zm10 0h2v2h-2zm8 0h2v2h-2z",
  "more-horizontal": "M3 9h2v2H3zm8 0h2v2h-2zm8 0h2v2h-2zM1 11h2v2H1zm8 0h2v2H9zm8 0h2v2h-2zM3 13h2v2H3zm8 0h2v2h-2zm8 0h2v2h-2zM5 11h2v2H5zm8 0h2v2h-2zm8 0h2v2h-2z",
  "logout": "M8 11h12v2H8zm8-2h2v2h-2z M14 7h2v10h-2zm2 6h2v2h-2zM6 2h12v2H6zm0 18h12v2H6zM4 4h2v16H4zm14 0h2v3h-2zm0 13h2v3h-2z",
  "user": "M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6zm10 0h2v2h-2z",
  "close": "M7 19H5V17H7V19ZM19 19H17V17H19V19ZM9 15V17H7V15H9ZM17 17H15V15H17V17ZM11 15H9V13H11V15ZM15 15H13V13H15V15ZM13 13H11V11H13V13ZM11 11H9V9H11V11ZM15 11H13V9H15V11ZM9 9H7V7H9V9ZM17 9H15V7H17V9ZM7 7H5V5H7V7ZM19 7H17V5H19V7Z",
  "chevron-down": "M13 16h-2v-2h2v2Zm-2-2H9v-2h2v2Zm4 0h-2v-2h2v2Zm-6-2H7v-2h2v2Zm8 0h-2v-2h2v2ZM7 10H5V8h2v2Zm12 0h-2V8h2v2Z",
  "chevron-right": "M16 13v-2h-2v2h2Zm-2-2V9h-2v2h2Zm0 4v-2h-2v2h2Zm-2-6V7h-2v2h2Zm0 8v-2h-2v2h2ZM10 7V5H8v2h2Zm0 12v-2H8v2h2Z",
  "archive": "M3 2h18v2H3zm0 5h18v2H3zM1 4h2v3H1zm20 0h2v3h-2zm-2 5h2v11h-2zM3 9h2v11H3zm2 11h14v2H5zm4-9h6v2H9z",
  "clock": "M6 2h12v2H6zM2 6h2v12H2zm18 0h2v12h-2zm-2-2h2v2h-2zM4 4h2v2H4zm2 18h12v-2H6zm12-2h2v-2h-2zM4 20h2v-2H4zm7-14h2v7h-2zm2 7h2v2h-2zm2 2h2v2h-2z",
  "arrows-horizontal": "M13 13v-2h10v2zm6 2v-2h2v2zm-2 2v-2h2v2zm2-6V9h2v2z M17 15V7h2v8zm-6-2v-2H1v2zm-6 2v-2H3v2zm2 2v-2H5v2zm-2-6V9H3v2z M7 15V7H5v8z",
  "balloon": "M9 1h6v2H9zM7 3h2v2H7zm8 0h2v2h-2zm-4 2h2v2h-2zm2 2h2v2h-2zM5 5h2v8H5zm12 0h2v8h-2zM7 13h2v2H7zm2 2h2v2H9zm4 4h4v2h-4zm-2-4h4v2h-4zm4-2h2v2h-2zm2 8h2v2h-2zm-6-4h2v2h-2z",
  "bookmark": "M6 2h12v2H6zM4 4h2v18H4zm14 0h2v18h-2zm-2 16h2v2h-2zm-2-2h2v2h-2zm-8 2h2v2H6zm2-2h2v2H8zm2-2h4v2h-4z",
  "bottle-wine": "M9 1h6v2H9zm0 2h2v4H9zm4 0h2v4h-2zM7 7h2v2H7zm8 0h2v2h-2zm2 2h2v12h-2zM5 9h2v12H5zm2 12h10v2H7z",
  "bug": "M2 5h2v4H2zm20 0h-2v4h2zM4 9h2v2H4zm16 0h-2v2h2zM2 13h4v2H2zm20 0h-4v2h4zM4 17h2v2H4zm16 0h-2v2h2zM2 19h2v2H2zm20 0h-2v2h2zM6 11h12v2H6z M6 7h2v12H6zm10 0h2v12h-2zM8 19h8v2H8zM8 5h8v2H8z M11 15h2v6h-2zM8 1h2v6H8zm6 0h2v6h-2z",
  "cake": "M1 20h22v2H1zm2-8h2v8H3zm2-2h14v2H5zm14 2h2v8h-2zm-8-5h2v3h-2zM7 7h2v3H7zm8 0h2v3h-2zM7 3h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zM5 14h2v2H5zm2 2h4v2H7zm4-2h6v2h-6zm6 2h2v2h-2z",
  "car": "M4 13h6v2H4zm10 0h6v2h-6zM4 17h6v2H4zm10 0h6v2h-6zM2 15h4v2H2zm6 0h8v2H8zm10 0h4v2h-4zm4-4h2v4h-2zm-6-4h2v2h-2zM4 5h12v2H4zm-4 6h2v4H0zm12-2h10v2H12zM2 7h2v4H2zm8 0h2v2h-2z",
  "checkbox-on": "M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM7 12h2v2H7zm2 2h2v2H9zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2z",
  "chess": "M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zM8 4h4v4H8zM4 8h4v4H4zm4 4h4v4H8zm-4 4h4v4H4zM16 4h4v4h-4zm-4 4h4v4h-4zm4 4h4v4h-4zm-4 4h4v4h-4z",
  "circle": "M6 2h12v2H6zm0 18h12v2H6zM2 6h2v12H2zm18 0h2v12h-2zm-2-2h2v2h-2zm0 14h2v2h-2zM4 4h2v2H4zm0 14h2v2H4z",
  "clapperboard": "M4 3h16v2H4zm0 6h16v2H4zM2 5h2v14H2zm18 0h2v14h-2zM4 19h16v2H4zM18 7h-2v2h2zm-8 0H8v2h2zm6-2h-2v2h2zM8 5H6v2h2z",
  "coffee": "M4 4h16v2H4zm0 2h2v8H4zm2 8h10v2H6zm14-8h2v4h-2zm-2 4h2v2h-2zm-2-4h2v8h-2zM2 18h18v2H2z",
  "crown": "M3 3h2v12H3zm16 0h2v12h-2zm-8 0h2v2h-2zM9 5h2v2H9zM5 5h2v2H5z M3 3h2v2H3zm4 4h2v2H7zm6-2h2v2h-2zm2 2h2v2h-2zm2-2h2v2h-2zM5 15h14v2H5zm-2 4h18v2H3z",
  "door-closed": "M3 19h18v2H3zM5 5h2v14H5zm2-2h10v2H7zm10 2h2v14h-2zm-8 6h2v2H9z",
  "eye-off": "M0 10h2v4H0zm24 0h-2v4h2zm-8 0h-2v2h2zm-6 0H8v4h2zM2 8h2v2H2zm0 8h2v-2H2zm20-8h-2v2h2zm0 8h-2v-2h2zM4 6h4v2H4zm0 12h4v-2H4zM20 6h-4v2h4zM10 4h6v2h-6zM8 20h8v-2H8zm4-12h2v2h-2zm-2 6h4v2h-4zM8 8h2v2H8zm2 2h2v4h-2zm2 2h2v2h-2z M6 6h2v2H6zM4 4h2v2H4zM2 2h2v2H2zm12 12h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2z",
  "file-text": "M6 4H4v16h2zm10-2H6v2h10zm4 4h-2v14h2zm-2 14H6v2h12zM16 4h2v2h-2zm-4 0h2v6h-2z M12 8h6v2h-6zm-4 8h8v2H8zm0-4h8v2H8zm0-4h2v2H8z",
  "fire": "M9 2h2v4H9zM7 6h2v2H7zM5 8h2v2H5zm8 2h2v2h-2zm2-2h2v2h-2zm2 2h2v2h-2zm2 2h2v6h-2zM3 10h2v8H3zm8-4h2v4h-2zm6 12h2v2h-2zM7 20h10v2H7zm-2-2h2v2H5zm4-2h6v4H9z M11 14h2v3h-2z",
  "fish": "M20 9h2v6h-2zm-2-2h2v2h-2zm0 8h2v2h-2zm-6 2h6v2h-6zm0-12h6v2h-6zM2 7h2v10H2zm2 2h2v2H4zm0 4h2v2H4zm2-2h2v2H6zm2-2h2v2H8zm0 4h2v2H8zm2 2h2v2h-2zm0-8h2v2h-2zm5 3h2v2h-2z",
  "gps": "M9 5h6v2H9zM7 7h2v2H7zm0 8h2v2H7zm8 0h2v2h-2zm0-8h2v2h-2zm2 2h2v6h-2zm-8 8h6v2H9zM5 9h2v6H5zm14 2h4v2h-4zM1 11h4v2H1zM11 1h2v4h-2zm0 18h2v4h-2z",
  "hand": "M21 7h2v5h-2zm-4-2h2v7h-2zm-4-2h2v8h-2zM9 3h2v8H9zM5 5h2v8H5zm14 0h2v2h-2zm-4-2h2v2h-2zm-4-2h2v2h-2zM7 3h2v2H7zm-4 8h2v2H3zm-2 2h2v2H1zm0 2h2v2H1zm2 2h2v2H3zm2 2h2v2H5zm2 2h12v2H7zm12-2h2v2h-2zm2-7h2v7h-2zM5 13h2v2H5zm2 2h2v2H7z",
  "handbag": "M7 4h2v7H7zm2-2h6v2H9zm6 2h2v7h-2z M5 7h14v2H5zm14 2h2v5h-2zM5 9H3v5h2zm16 5h2v6h-2zM3 14H1v6h2zm0 6h18v2H3z",
  "image": "M4 2h16v2H4zm0 18h16v2H4zM2 4h2v16H2zm18 0h2v16h-2zm-4 8h2v2h-2zm-2 2h2v2h-2zm4 0h2v2h-2zm-8 0h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2z M20 16h2v2h-2zM8 16h2v2H8zm-2 2h2v2H6zM8 6h2v2H8zM6 8h2v2H6zm2 2h2v2H8zm2-2h2v2h-2z",
  "loader": "M13 22h-2v-6h2v6Zm-6-3H5v-2h2v2Zm12 0h-2v-2h2v2ZM9 17H7v-2h2v2Zm8 0h-2v-2h2v2Zm-9-4H2v-2h6v2Zm14 0h-6v-2h6v2ZM9 9H7V7h2v2Zm8 0h-2V7h2v2Zm-4-1h-2V2h2v6ZM7 7H5V5h2v2Zm12 0h-2V5h2v2Z",
  "bell": "M9 2h6v2H9zM7 4h2v2H7zm8 0h2v2h-2zM5 6h2v7H5zm12 0h2v7h-2zM3 13h2v4H3zm16 0h2v4h-2z M3 15h18v2H3zm5 3h2v2H8zm6 0h2v2h-2zm-4 2h4v2h-4z",
  "mail": "M6 8h2v2H6zm2 2h2v2H8zm10-2h-2v2h2zm-2 2h-2v2h2zm-6 2h4v2h-4zM2 6h2v12H2zm18 0h2v12h-2zM4 4h16v2H4zm0 14h16v2H4z",
  "meh": "M6 20h12v2H6zM6 2h12v2H6zm12 2h2v2h-2zM4 4h2v2H4zm0 14h2v2H4zm14 0h2v2h-2zM2 6h2v12H2zm18 0h2v12h-2zM7 14h10v2H7zm1-6h2v2H8zm6 0h2v2h-2z",
  "money": "M8 8h12v2H8zm0 10h12v2H8zm-2-8h2v8H6zm14 0h2v8h-2zM4 4h12v2H4zm0 10h2v2H4zM2 6h2v8H2zm14 0h2v2h-2zm-4 6h4v4h-4z",
  "notebook": "M6 2h14v2H6zm0 18h14v2H6zM20 4h2v16h-2zM4 4h2v16H4z M2 7h6v2H2zm0 4h6v2H2zm0 4h6v2H2zM16 4h2v16h-2z",
  "party-popper": "M4 20H6V22H2V18H4V20ZM20 21H18V19H20V21ZM10 20H6V18H10V20ZM6 18H4V14H6V18ZM14 18H10V16H14V18ZM10 16H8V14H10V16ZM16 16H14V12H16V16ZM22 16H20V14H22V16ZM8 14H6V10H8V14ZM20 14H18V12H20V14ZM14 12H12V10H14V12ZM12 10H8V8H12V10ZM20 9H16V7H20V9ZM5 8H3V6H5V8ZM22 7H20V5H22V7ZM12 6H10V4H12V6ZM10 4H8V2H10V4ZM17 4H15V2H17V4Z",
  "radio": "M11 9h2v2h-2zm0 4h2v2h-2zm-2-2h2v2H9zm4 0h2v2h-2zm6-2h-2v6h2zM5 9h2v6H5zm18-2h-2v10h2zM1 7h2v10H1zm16 0h-2v2h2zM7 7h2v2H7zm14-2h-2v2h2zM3 5h2v2H3zm14 10h-2v2h2zM7 15h2v2H7zm14 2h-2v2h2zM3 17h2v2H3z",
  "scale": "M13 9h2v2h-2zm2-2h2v2h-2zm2-2h2v2h-2zm2-2h2v8h-2z M13 3h8v2h-8zm-2 12H9v-2h2zm-2 2H7v-2h2zm-2 2H5v-2h2zm-2 2H3v-8h2z M11 21H3v-2h8z",
  "search": "M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2h8v2Zm4 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm10 0h-2v-2h2v2ZM4 14H2V6h2v8Zm14 0h-2V6h2v8ZM6 6H4V4h2v2Zm10 0h-2V4h2v2Zm-2-2H6V2h8v2Z",
  "shopping-cart": "M2 2h2v2H2zm2 6h2v4H4zm2 4h2v4H6zm2 4h10v2H8zm10-4h2v4h-2zm2-4h2v4h-2zM4 6h18v2H4zm0-4h2v4H4zm2 17h3v3H6zm11 0h3v3h-3z",
  "skull": "M7 20h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-6-4h2v4H9zm4 0h2v4h-2zm-8-2h2v6H5zm12 0h2v6h-2z M3 14h4v2H3zM1 4h2v10H1zm20 0h2v10h-2zM3 2h18v2H3zm14 12h4v2h-4zM8 7h2v4H8zm6 0h2v4h-2z",
  "sparkles": "M11 1h2v4h-2zm0 22h2v-4h-2zM9 5h2v4H9zm0 14h2v-4H9zm4-14h2v4h-2zm0 14h2v-4h-2zM5 9h4v2H5zm14 0h-4v2h4zM1 11h4v2H1zm22 0h-4v2h4zM5 13h4v2H5zm14 0h-4v2h4zm0-12h2v6h-2z M17 3h6v2h-6zM3 17h2v2H3zm-2 2h2v2H1zm2 2h2v2H3zm2-2h2v2H5z",
  "sunglasses": "M15 10h5v2h-5zM4 10h5v2H4zm16 2h2v5h-2zM9 12h2v5H9zm4 0h2v5h-2zM2 12h2v5H2zm13 5h5v2h-5zM4 17h5v2H4zm7-5h2v2h-2zM2 6h2v6H2zm18 0h2v6h-2zM4 4h2v2H4zm14 0h2v2h-2zM6 12h3v2H6zm11 0h3v2h-3zM4 14h2v3H4zm11 0h2v3h-2zm-9 2h3v1H6zm11 0h3v1h-3zm-9-2h1v2H8zm11 0h1v2h-1z",
  "tree-pine": "M11 2h2v2h-2zM9 4h2v2H9zm4 0h2v2h-2zm2 2h2v2h-2zM7 6h2v2H7zm0 4h2v2H7zm-2 2h2v2H5zm2 2h2v2H7zm-2 2h2v2H5zm-2 2h18v2H3zM13 8h2v2h-2zm2 2h2v2h-2zM9 8h2v2H9zm8 4h2v2h-2zm-2 2h2v2h-2zm2 2h2v2h-2zm-6 4h2v2h-2z",
  "trophy": "M16 17H13V19H15V21H9V19H11V17H8V15H16V17ZM18 5H22V11H20V7H18V11H20V13H18V15H16V5H8V15H6V13H4V11H6V7H4V11H2V5H6V3H18V5Z",
  "unlock": "M5 8h14v2H5zm0 12h14v2H5zM3 10h2v10H3zm16 0h2v10h-2zM7 4h2v4H7zm2-2h6v2H9zm6 2h2v2h-2z",
  "zap": "M4 13h8v6h2v2h-2v2h-2v-8H2v-4h2v2Zm12 6h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2v-2h2v2Zm-6-6h8v4h-2v-2h-8V5h-2V3h2V1h2v8Zm-8 2H4V9h2v2Zm2-2H6V7h2v2Zm2-2H8V5h2v2Z",
  "warning-diamond": "M2 10h2v2H2zm0 4h2v-2H2zm20-4h-2v2h2zm0 4h-2v-2h2zM4 8h2v2H4zm0 8h2v-2H4zm16-8h-2v2h2zm0 8h-2v-2h2zM6 6h2v2H6zm0 12h2v-2H6zM18 6h-2v2h2zm0 12h-2v-2h2zM8 4h2v2H8zm0 16h2v-2H8zm8-16h-2v2h2zm0 16h-2v-2h2zM10 2h2v2h-2zm0 20h2v-2h-2zm4-20h-2v2h2zm0 20h-2v-2h2zm-3-5h2v-2h-2zm0-4h2V7h-2z",

  // ---- Filled variants (Pixelarticons Pro, vendor/pixelarticons-pro) ----
  // Used for selected-state nav items; add more via scripts/icon.mjs.
  "home-solid": "M6 8V6h2V4h2V2h4v2h2v2h2v2h2v2h2v10h-2v2H4v-2H2V10h2V8h2Zm4 6v6h4v-6h-4Z",
  "book-open-solid": "M11 5h2V3h9v2h2v16H13v2h-2v-2H0V5h2V3h9v2Zm0 14h2V7h-2v12Zm4-2h2v-2h-2v2Zm0-4h5v-2h-5v2Zm0-4h5V7h-5v2Z",
  "calendar-solid": "M17 4h2v2h2v14h-2v2H5v-2H3V6h2V4h2V2h2v2h6V2h2v2ZM5 10h14V8H5v2Z",
  "tv-solid": "M20 5h2v10h-2v2h-5v2h3v2H6v-2h3v-2H4v-2H2V5h2V3h16v2Z",
  "folder-glyph": "M12 6h10v14H2V4h10v2Z",
  "gift-solid": "M11 22H6v-2H4v-6h7v8Zm7 0h-5v-8h7v6h-2v2ZM8 6h3v6H2V8h2V6h2V4h2v2Zm10 0h2v2h2v4h-9V6h3V4h2v2Zm-5 0h-2V4h2v2Zm-2-2H8V2h3v2Zm5 0h-3V2h3v2Z",
  "contact-solid": "M22 22H2v-2H0V4h2V2h20v2h2v16h-2v2ZM6 15H4v2h2v-2h4v2h2v-2h-2v-2H6v2Zm8 2h4v-2h-4v2Zm0-4h6v-2h-6v2Zm-8-2h4V7H6v4Zm8-2h6V7h-6v2Z",
  "lock-solid": "M9 8h6V4h2v4h2v2h2v10h-2v2H5v-2H3V10h2V8h2V4h2v4Zm6-4H9V2h6v2Z",
  "map-pin-solid": "M17 4h2v2h2v8h-2v3h-2v2h-2v2h-2v2h-2v-2H9v-2H7v-2H5v-3H3V6h2V4h2V2h10v2Zm-7 4H8v4h2v2h4v-2h2V8h-2V6h-4v2Zm4 4h-4V8h4v4Z",
  "lightbulb-solid": "M15 22H9v-4h6v4Zm0-16h2v2h2v6h-2v2H7v-2H5V8h2V6h2V4h6v2ZM3 12H0v-2h3v2Zm21 0h-3v-2h3v2ZM5 6H3V4h2v2Zm16 0h-2V4h2v2ZM3 4H1V2h2v2Zm20 0h-2V2h2v2ZM13 3h-2V0h2v3Z",
  "store-solid": "M10 13h4v-2h4v2h3v8h-2v2h-3v-6h-2v-2h-4v2H8v6H5v-2H3v-8h3v-2h4v2Zm4 10h-4v-6h4v6Zm0-12h-4V9H6v2H0V7h2V5h2V3h16v2h2v2h2v4h-6V9h-4v2Z",
  "chart-bar-big-solid": "M22 22H4v-2h18v2ZM4 20H2V2h2v18Zm12-7h2v3h-2v2H8v-2H6v-3h2v-2h8v2Zm2-4H8V7H6V4h2V2h10v2h2v3h-2v2Z",
  "eye-solid": "M8 18H4v-2H2v-2H0v-4h2V8h2V6h4V4h8v2h4v2h2v2h2v4h-2v2h-2v2h-4v2H8v-2Zm2-8H8v4h2v2h4v-2h2v-4h-2V8h-4v2Zm4 2h-2v-2h2v2Z",
  "target-solid": "M19 23H5v-2H3v-2H1V5h2V3h2V1h14v2h2v2h2v14h-2v2h-2v2ZM9 19h6v-2H9v2Zm-2-2h2v-2H7v2Zm8 0h2v-2h-2v2ZM5 15h2V9H5v6Zm6 0h2v-2h-2v2Zm6 0h2V9h-2v6Zm-8-2h2v-2H9v2Zm4 0h2v-2h-2v2Zm-2-2h2V9h-2v2ZM7 9h2V7H7v2Zm8 0h2V7h-2v2ZM9 7h6V5H9v2Z",
  "robot-face-happy-solid": "M13 6h7v2h2v4h2v2h-2v6h-2v2H4v-2H2v-6H0v-2h2V8h2V6h7V4h2v2ZM7 16h2v2h6v-2h2v-2H7v2Zm1-4h2v-2H8v2Zm6 0h2v-2h-2v2Zm3-8h-4V2h4v2Z",
  "clock-solid": "M18 4h2v2h2v12h-2v2h-2v2H6v-2H4v-2H2V6h2V4h2V2h12v2Zm-3 11v2h2v-2h-2Zm-2-2v2h2v-2h-2Zm-2-7v7h2V6h-2Z",
  "fish-solid": "M18 7h2v2h2v6h-2v2h-2v2h-6v-2h-2v-2H8v-2H6v2H4v2H2V7h2v2h2v2h2V9h2V7h2V5h6v2Zm-3 5h2v-2h-2v2Z",
  "settings-cog-solid": "M15 4h2V2h5v5h-2v2h4v6h-4v2h2v5h-5v-2h-2v4H9v-4H7v2H2v-5h2v-2H0V9h4V7H2V2h5v2h2V0h6v4Zm-5 10h4v-4h-4v4Z",
  "user-solid": "M16 16h2v2h2v4H4v-4h2v-2h2v-2h8v2ZM15 4h2v6h-2v2H9v-2H7V4h2V2h6v2Z",
  // Hand-drawn on the 24px grid (no pixelarticons dumbbell exists): two
  // plates a side + bar, for The Pump.
  "dumbbell": "M2 8h2v8H2zM5 6h2v12H5zM7 11h10v2H7zM17 6h2v12h-2zM20 8h2v8h-2z",
} as const;

/**
 * The filled twin of an outline icon (e.g. selected nav items). Falls
 * back to the outline when no filled variant has been inlined yet.
 */
export function solidIcon(name: IconName): IconName {
  const solid = `${name}-solid` as IconName;
  if (solid in PATHS) return solid;
  const glyph = `${name}-glyph` as IconName;
  return glyph in PATHS ? glyph : name;
}

/**
 * Raw SVG markup for contexts that need an HTML string instead of JSX
 * (e.g. Leaflet divIcon markers).
 */
export function pixelIconSvg(name: IconName, size = 18, color = "#101010"): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
}

export function PixelIcon({
  name,
  size = 20,
  className = "",
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
