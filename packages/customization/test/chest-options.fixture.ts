import type { ColorRegion, ProductOption, ProductVariants } from "../src/types.js";

/** Copied from dostal-3d-printing/shop-assets/color/color-regions.json (version 2), treasure-chest, without notes. */
export const CHEST_OPTIONS: ProductOption[] = [
  {
    "id": "lock_position",
    "label": "Lock position",
    "choices": [
      {
        "id": "below",
        "label": "Below the seam"
      },
      {
        "id": "seam",
        "label": "At the seam"
      },
      {
        "id": "none",
        "label": "No lock"
      }
    ]
  },
  {
    "id": "lock_style",
    "label": "Lock style",
    "when": {
      "lock_position": [
        "below",
        "seam"
      ]
    },
    "choices": [
      {
        "id": "keyhole",
        "label": "Keyhole plate"
      },
      {
        "id": "painted",
        "label": "Painted hasp"
      },
      {
        "id": "working",
        "label": "Working pirate lock",
        "only": {
          "lock_position": [
            "seam"
          ]
        }
      }
    ]
  },
  {
    "id": "hardware",
    "label": "Hardware",
    "choices": [
      {
        "id": "printed",
        "label": "Printed"
      },
      {
        "id": "metal",
        "label": "Real metal hardware",
        "status": "request"
      }
    ]
  }
];

export const CHEST_VARIANTS: ProductVariants = {
  "key": "lock",
  "rows": [
    {
      "id": "plate",
      "label": "Keyhole, below",
      "when": {
        "lock_position": "below",
        "lock_style": "keyhole"
      }
    },
    {
      "id": "plate-seam",
      "label": "Keyhole, at the seam",
      "when": {
        "lock_position": "seam",
        "lock_style": "keyhole"
      }
    },
    {
      "id": "painted",
      "label": "Painted hasp, below",
      "when": {
        "lock_position": "below",
        "lock_style": "painted"
      }
    },
    {
      "id": "painted-seam",
      "label": "Painted hasp, at the seam",
      "when": {
        "lock_position": "seam",
        "lock_style": "painted"
      }
    },
    {
      "id": "hasp",
      "label": "Working pirate lock",
      "when": {
        "lock_position": "seam",
        "lock_style": "working"
      }
    },
    {
      "id": "none",
      "label": "No lock",
      "when": {
        "lock_position": "none"
      }
    }
  ]
};

export const CHEST_REGIONS: ColorRegion[] = [
  {
    "id": "body",
    "label": "Chest bottom",
    "defaultHex": "#7A4A24",
    "separable": true
  },
  {
    "id": "lid-body",
    "label": "Chest lid",
    "defaultHex": "#7A4A24",
    "separable": true
  },
  {
    "id": "straps",
    "label": "Straps",
    "defaultHex": "#141414",
    "separable": true
  },
  {
    "id": "name",
    "label": "Name",
    "defaultHex": "#141414",
    "separable": false,
    "parentRegionId": "plate"
  },
  {
    "id": "plate-border",
    "label": "Name plate border",
    "defaultHex": "#141414",
    "separable": false,
    "parentRegionId": "plate"
  },
  {
    "id": "plate",
    "label": "Name plate",
    "defaultHex": "#F4D21F",
    "separable": true
  },
  {
    "id": "lock",
    "label": "Lock",
    "defaultHex": "#F4D21F",
    "separable": true,
    "when": {
      "lock": [
        "plate",
        "plate-seam",
        "painted",
        "painted-seam"
      ]
    }
  },
  {
    "id": "lock-hoop",
    "label": "Hoop, knuckles and rivets",
    "defaultHex": "#141414",
    "separable": false,
    "parentRegionId": "lock",
    "when": {
      "lock": [
        "painted-seam"
      ]
    }
  },
  {
    "id": "hasp-flap",
    "label": "Lock flap",
    "defaultHex": "#F4D21F",
    "separable": true,
    "when": {
      "lock": [
        "hasp"
      ]
    }
  },
  {
    "id": "hasp-rivets",
    "label": "Flap rivets",
    "defaultHex": "#141414",
    "separable": false,
    "parentRegionId": "hasp-flap",
    "when": {
      "lock": [
        "hasp"
      ]
    }
  },
  {
    "id": "hasp-knuckles",
    "label": "Hinge knuckles",
    "defaultHex": "#141414",
    "separable": false,
    "parentRegionId": "lid-body",
    "when": {
      "lock": [
        "hasp"
      ]
    }
  },
  {
    "id": "hasp-loop",
    "label": "Lock loop",
    "defaultHex": "#141414",
    "separable": false,
    "parentRegionId": "body",
    "when": {
      "lock": [
        "hasp"
      ]
    }
  },
  {
    "id": "hasp-key",
    "label": "Key",
    "defaultHex": "#F4D21F",
    "separable": true,
    "when": {
      "lock": [
        "hasp"
      ]
    }
  }
];
