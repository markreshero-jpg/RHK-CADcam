// Default Construction Method — Standard Frameless EU
// Matches DEFAULT_RULES in the resolver

export const DEFAULT_CONSTRUCTION_METHOD = {
  id: 'default-method',
  name: 'Standard Frameless EU',
  rules: {
    // Toe kick
    TOEH:    150,
    TOE_TYPE: 'ladder' as const,
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
    IDCL: 2, IDCR: 2, IDFAO: 0, IDRUN: 450,

    // Face reveals
    REVT:    4,   // top reveal
    REVB:    0,   // bottom reveal
    REVL:    1,   // left reveal
    REVR:    1,   // right reveal
    REVENDL: 2,   // left end reveal
    REVENDR: 2,   // right end reveal
    GAPC:    2,   // gap between doors (centre split)
    GAPR:    2,   // gap between drawers

    // Face clearance
    FACBUF: 2,   // buffer around face opening
    FACINS: 0,   // face inset
  }
}

export type ConstructionRules = typeof DEFAULT_CONSTRUCTION_METHOD.rules
