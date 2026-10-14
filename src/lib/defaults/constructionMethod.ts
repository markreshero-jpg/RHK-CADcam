// Default Construction Method — Standard Frameless EU
// Matches DEFAULT_RULES in the resolver

export const DEFAULT_CONSTRUCTION_METHOD = {
  id: 'default-method',
  name: 'Standard Frameless EU',
  rules: {
    // Toe kick
    TOEH:    150,
    TOE_TYPE: 'ladder' as const,
    TOEFC:   16.5,
    TOESP:   450,
    TOESCF:  40,
    TOESCB:  0,
    TOESCL:  0,
    TOESCR:  0,

    // Case scribes
    SCRBK: 0, SCRBT: 0, SCRL: 0, SCRR: 0, SCRT: 0,

    // Top
    TOP_TYPE: 'front_rail' as const,
    RD:       100,  // rail depth mm

    // Adjustable shelves
    ADJSB_F: 10, ADJSB_B: 0, ADJSL: 1, ADJSR: 1,

    // Fixed shelves
    FIXSB_F: 0, FIXSB_B: 0,

    // Inner drawers
    IDCL: 2, IDCR: 2, IDFAO: 0, SLIDE_SETBACK: 20,

    // Face reveals
    REVT:    4,   // top reveal
    REVB:    0,   // bottom reveal
    REVL:    1,   // left reveal
    REVR:    1,   // right reveal
    REVENDL: 2,   // left end reveal
    REVENDR: 2,   // right end reveal
    GAPC:    2,   // gap between doors (centre split)
    GAPR:    2,   // gap between drawers
    FPGAP:   20,  // finger gap at a sharknose / finger-pull grip edge (z_handles)
    RAILH:   45,  // finger-pull backing rail height
    RAILUP:  5,   // rail overlap behind the plain front above the gap
    RAILCUT: 5,   // notch end relief depth (cutter radius); relief height = 2 × this
    RAILBLK: 15,  // knock-in block hole: back of rail → hole centre
    RAILBLKD: 10, // knock-in block hole diameter
    RAILBLKZ: 12, // knock-in block hole depth

    // Face clearance
    FACBUF: 2,   // buffer around face opening
    FACINS: 0,   // face inset

    // Shaped cabinets: panels meeting at an angle (z_cabinet_shape 4a)
    ANGLE_JOIN: 'butt_bevel' as 'butt_bevel' | 'mitre',
  }
}

export type ConstructionRules = typeof DEFAULT_CONSTRUCTION_METHOD.rules
