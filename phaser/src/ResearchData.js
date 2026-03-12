// ResearchData.js -- Full Tier 1 Tech Tree for Attrition
// Based on GDD TECH_TREE.md §§1-8, Tier 1 scope only.
//
// Tech kinds:
//   chassis  = unlocks a new unit type in Unit Designer + auto-creates Mk.0 design
//   building = unlocks a new building type for engineers
//   stat     = boosts unit or building stats
//   economy  = resource income / production bonuses
//   research = RP generation / parallel slots
//   module   = unlocks a new module option in Unit Designer
//   doctrine = combat behavior change (not a stat number)

export const RESEARCH_BRANCHES = {
  industrial:  { label: 'Industrial',  icon: '⚙' },
  infantry:    { label: 'Infantry',    icon: '●' },
  vehicles:    { label: 'Vehicles',    icon: '■' },
  air:         { label: 'Air',         icon: '✈' },
  naval:       { label: 'Naval',       icon: '◖' },
  engineering: { label: 'Engineering', icon: '◆' },
  science:     { label: 'Science',     icon: '⚗' },
};

export const TECH_TREE = {

  // ═══════════════════════════════════════════════════════════════════════════
  // INDUSTRIAL
  // ═══════════════════════════════════════════════════════════════════════════

  improved_mines: {
    id:'improved_mines', branch:'industrial', tier:0, kind:'economy',
    name:'Improved Mine Shafts',
    desc:'Deeper shafts. Iron Mines +1 iron/turn.',
    cost:20, prereqs:[],
    effect:{ buildingBonus:{ MINE:{ ironPerTurn:1 } } },
  },
  oil_efficiency: {
    id:'oil_efficiency', branch:'industrial', tier:0, kind:'economy',
    name:'Oil Pump Efficiency',
    desc:'Better pump engineering. Oil Pumps +1 oil/turn.',
    cost:20, prereqs:[],
    effect:{ buildingBonus:{ OIL_PUMP:{ oilPerTurn:1 } } },
  },
  farm_yield: {
    id:'farm_yield', branch:'industrial', tier:0, kind:'economy',
    name:'Crop Rotation',
    desc:'Farm food output +1 per turn.',
    cost:15, prereqs:[],
    effect:{ buildingBonus:{ FARM:{ foodPerTurn:1 } } },
  },
  market_trade: {
    id:'market_trade', branch:'industrial', tier:0, kind:'economy',
    name:'Market Economy',
    desc:'Markets +1 gold/turn.',
    cost:20, prereqs:[],
    effect:{ buildingBonus:{ MARKET:{ goldPerTurn:1 } } },
  },
  assembly_line: {
    id:'assembly_line', branch:'industrial', tier:1, kind:'stat',
    name:'Assembly Line',
    desc:'Standardized parts reduce all unit build times by 1 turn (min 1).',
    cost:30, prereqs:['improved_mines'],
    effect:{ globalBuildTimeBonus:1 },
  },
  standardized_parts: {
    id:'standardized_parts', branch:'industrial', tier:1, kind:'stat',
    name:'Standardized Parts',
    desc:'Uniform components cut repair costs. All unit train costs −1 iron (min 1).',
    cost:20, prereqs:['assembly_line'],
    effect:{ globalTrainCostBonus:{ iron:-1 } },
  },
  blast_furnace: {
    id:'blast_furnace', branch:'industrial', tier:2, kind:'stat',
    name:'Blast Furnace',
    desc:'Vehicle Depot builds 1 turn faster. Enables heavier vehicle production.',
    cost:35, prereqs:['assembly_line'],
    effect:{ buildingBonus:{ VEHICLE_DEPOT:{ buildTurns:-1 } } },
  },
  basic_steel_alloys: {
    id:'basic_steel_alloys', branch:'industrial', tier:2, kind:'module',
    name:'Basic Steel Alloys',
    desc:'🔩 MODULE — Unlocks Steel Armor module for vehicles and engineers.',
    cost:25, prereqs:['blast_furnace'],
    effect:{ unlockModule:'STEEL_ARMOR' },
  },
  open_pit_mining: {
    id:'open_pit_mining', branch:'industrial', tier:2, kind:'economy',
    name:'Open Pit Mining',
    desc:'New cheaper mine type. Mines produce +1 iron/turn (cumulative).',
    cost:30, prereqs:['improved_mines'],
    effect:{ buildingBonus:{ MINE:{ ironPerTurn:1 } } },
  },
  rubber_processing: {
    id:'rubber_processing', branch:'industrial', tier:1, kind:'stat',
    name:'Rubber Processing',
    desc:'Wheeled vehicles (recon, trucks) ignore rough terrain movement penalties.',
    cost:15, prereqs:[],
    effect:{ unitStatBonus:{ RECON:{ terrainIgnore:1 }, ARMORED_CAR:{ terrainIgnore:1 } } },
  },
  concrete_roads: {
    id:'concrete_roads', branch:'industrial', tier:1, kind:'building',
    name:'Concrete Roads',
    desc:'🏗 BUILDING — Engineers can upgrade Dirt Roads to faster Concrete Roads.',
    cost:25, prereqs:['improved_mines'],
    effect:{ unlockBuilding:'CONCRETE_ROAD' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INFANTRY
  // ═══════════════════════════════════════════════════════════════════════════

  steel_helmet: {
    id:'steel_helmet', branch:'infantry', tier:0, kind:'stat',
    name:'Steel Helmet',
    desc:'All infantry gain +1 defense.',
    cost:10, prereqs:[],
    effect:{ unitStatBonus:{ INFANTRY:{ defense:1 }, ENGINEER:{ defense:1 }, MEDIC:{ defense:1 }, ANTI_TANK:{ defense:1 } } },
  },
  semi_auto_rifle: {
    id:'semi_auto_rifle', branch:'infantry', tier:0, kind:'stat',
    name:'Semi-Automatic Rifle',
    desc:'Faster fire rate. Infantry soft attack +1.',
    cost:15, prereqs:[],
    effect:{ unitStatBonus:{ INFANTRY:{ soft_attack:1 } } },
  },
  bayonet_doctrine: {
    id:'bayonet_doctrine', branch:'infantry', tier:0, kind:'doctrine',
    name:'Bayonet Doctrine',
    desc:'Infantry melee at range 0: soft attack +2.',
    cost:10, prereqs:['semi_auto_rifle'],
    effect:{ unitStatBonus:{ INFANTRY:{ close_attack_bonus:2 } } },
  },
  entrenching_tools: {
    id:'entrenching_tools', branch:'infantry', tier:0, kind:'building',
    name:'Entrenching Tools',
    desc:'🏗 BUILDING — Engineers can build Trenches for defensive fortification.',
    cost:15, prereqs:[],
    effect:{ unlockBuilding:'TRENCH' },
  },
  field_radio: {
    id:'field_radio', branch:'infantry', tier:1, kind:'stat',
    name:'Field Radio (Backpack)',
    desc:'Units can spot for artillery at +3 hex range.',
    cost:20, prereqs:['steel_helmet'],
    effect:{ unitStatBonus:{ INFANTRY:{ sight:1 }, RECON:{ sight:2 } } },
  },
  smg_doctrine: {
    id:'smg_doctrine', branch:'infantry', tier:1, kind:'module',
    name:'SMG Package',
    desc:'🔩 MODULE — Infantry loadout: +2 soft attack, -1 range, bonus vs garrisoned units.',
    cost:20, prereqs:['semi_auto_rifle'],
    effect:{ unlockModule:'INF_SMG_PACKAGE' },
  },
  grenade_training: {
    id:'grenade_training', branch:'infantry', tier:1, kind:'module',
    name:'Grenade Training',
    desc:'🔩 MODULE — Unlocks grenade kit for infantry designs (assault fortification bonus).',
    cost:10, prereqs:['semi_auto_rifle'],
    effect:{ unlockModule:'INF_GRENADE_KIT', unitStatBonus:{ INFANTRY:{ soft_attack:1 } } },
  },
  lmg_suppression: {
    id:'lmg_suppression', branch:'infantry', tier:1, kind:'module',
    name:'LMG Suppression Fire',
    desc:'🔩 MODULE — Unlocks LMG package: +1 range, suppression on hit, -1 move.',
    cost:20, prereqs:['steel_helmet'],
    effect:{ unlockModule:'INF_LMG_PACKAGE' },
  },
  at_rifle_upgrade: {
    id:'at_rifle_upgrade', branch:'infantry', tier:1, kind:'module',
    name:'AT Rifle (Improved)',
    desc:'🔩 MODULE — Unlocks infantry AT-rifle package (+hard attack, +pierce). Also buffs anti-tank squads.',
    cost:25, prereqs:['steel_helmet'],
    effect:{ unlockModule:'INF_AT_RIFLE_PACKAGE', unitStatBonus:{ ANTI_TANK:{ pierce:1, hard_attack:1 } } },
  },
  field_medic_kit: {
    id:'field_medic_kit', branch:'infantry', tier:1, kind:'stat',
    name:'Field Medic Kit',
    desc:'Medic range +1, sight +1.',
    cost:15, prereqs:['steel_helmet'],
    effect:{ unitStatBonus:{ MEDIC:{ range:1, sight:1 } } },
  },
  hmg_team: {
    id:'hmg_team', branch:'infantry', tier:2, kind:'module',
    name:'HMG Emplacement Kit',
    desc:'🔩 MODULE — Heavy MG module for infantry designs: strong suppression, no move-and-fire.',
    cost:25, prereqs:['lmg_suppression'],
    effect:{ unlockModule:'INF_HMG_EMPLACEMENT' },
  },
  basic_recon_training: {
    id:'basic_recon_training', branch:'infantry', tier:1, kind:'stat',
    name:'Basic Recon Training',
    desc:'Recon units: vision +1, evasion +2 (harder to spot).',
    cost:20, prereqs:[],
    effect:{ unitStatBonus:{ RECON:{ sight:1, evasion:2 } } },
  },
  assault_infantry: {
    id:'assault_infantry', branch:'infantry', tier:2, kind:'doctrine',
    name:'Assault Infantry Doctrine',
    desc:'Doctrine: infantry using SMG/Grenade modules gain fortification assault bonus.',
    cost:40, prereqs:['at_rifle_upgrade', 'grenade_training'],
    effect:{ unitStatBonus:{ INFANTRY:{ fortification_assault:2 } } },
  },
  sniper_team: {
    id:'sniper_team', branch:'infantry', tier:2, kind:'module',
    name:'Sniper Package',
    desc:'🔩 MODULE — Long-range precision package for infantry designs (+2 range, +accuracy, -move).',
    cost:30, prereqs:['basic_recon_training'],
    effect:{ unlockModule:'INF_SNIPER_PACKAGE' },
  },
  camo_webbing: {
    id:'camo_webbing', branch:'infantry', tier:1, kind:'module',
    name:'Camo Webbing',
    desc:'🔩 MODULE — Infantry/recon camouflage rig: +evasion, +defense, -move.',
    cost:18, prereqs:['steel_helmet'],
    effect:{ unlockModule:'INF_CAMO_WEBBING' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VEHICLES
  // ═══════════════════════════════════════════════════════════════════════════

  light_tank_armor: {
    id:'light_tank_armor', branch:'vehicles', tier:0, kind:'stat',
    name:'Improved Light Tank',
    desc:'Tanks +1 health, +1 armor.',
    cost:30, prereqs:[],
    effect:{ unitStatBonus:{ TANK:{ health:1, armor:1 } } },
  },
  apcr_rounds: {
    id:'apcr_rounds', branch:'vehicles', tier:1, kind:'module',
    name:'APCR Rounds',
    desc:'🔩 MODULE — Vehicle ammo package: +pierce and +hard attack.',
    cost:22, prereqs:['light_tank_armor'],
    effect:{ unlockModule:'VEH_APCR_ROUNDS' },
  },
  engine_upgrade: {
    id:'engine_upgrade', branch:'vehicles', tier:0, kind:'stat',
    name:'High-Speed Engine',
    desc:'Tanks and Recon +1 movement.',
    cost:25, prereqs:[],
    effect:{ unitStatBonus:{ TANK:{ move:1 }, RECON:{ move:1 } } },
  },
  artillery_range: {
    id:'artillery_range', branch:'vehicles', tier:0, kind:'stat',
    name:'Long Barrel Artillery',
    desc:'Artillery range +1, soft attack +1.',
    cost:20, prereqs:[],
    effect:{ unitStatBonus:{ ARTILLERY:{ range:1, soft_attack:1 } } },
  },
  motorcycle_recon: {
    id:'motorcycle_recon', branch:'vehicles', tier:0, kind:'chassis',
    name:'Motorcycle Recon',
    desc:'🔓 NEW CHASSIS — Fast scout: Move 7 on roads. No armor, vision 5.',
    cost:15, prereqs:[],
    effect:{ unlockChassis:'MOTORCYCLE' },
  },
  scout_car_radio: {
    id:'scout_car_radio', branch:'vehicles', tier:1, kind:'stat',
    name:'Scout Car Radio Package',
    desc:'Recon and armored cars spot for artillery +4 hex range.',
    cost:15, prereqs:['engine_upgrade'],
    effect:{ unitStatBonus:{ RECON:{ sight:2 }, ARMORED_CAR:{ sight:2 } } },
  },
  light_halftrack: {
    id:'light_halftrack', branch:'vehicles', tier:1, kind:'chassis',
    name:'Light Halftrack',
    desc:'🔓 NEW CHASSIS — Carries 1 infantry squad. Light armor. Move 4.',
    cost:25, prereqs:['engine_upgrade'],
    effect:{ unlockChassis:'HALFTRACK' },
  },
  medium_tank: {
    id:'medium_tank', branch:'vehicles', tier:1, kind:'chassis',
    name:'Medium Tank',
    desc:'🔓 NEW CHASSIS — Heavier tank with better armor and firepower than the light tank.',
    cost:45, prereqs:['light_tank_armor'],
    effect:{ unlockChassis:'MEDIUM_TANK' },
  },
  self_propelled_gun: {
    id:'self_propelled_gun', branch:'vehicles', tier:1, kind:'chassis',
    name:'Self-Propelled Gun',
    desc:'🔓 NEW CHASSIS — Artillery on a tank chassis. Mobile heavy fire support.',
    cost:40, prereqs:['artillery_range'],
    effect:{ unlockChassis:'SPG' },
  },
  armored_car: {
    id:'armored_car', branch:'vehicles', tier:1, kind:'chassis',
    name:'Armored Car',
    desc:'🔓 NEW CHASSIS — Fast wheeled recon vehicle with light armament.',
    cost:30, prereqs:['engine_upgrade'],
    effect:{ unlockChassis:'ARMORED_CAR' },
  },
  supply_truck_unlock: {
    id:'supply_truck_unlock', branch:'vehicles', tier:1, kind:'chassis',
    name:'Supply Truck Doctrine',
    desc:'🔓 NEW CHASSIS — Unarmed logistics vehicle. Projects supply bubble (radius 3) around it.',
    cost:20, prereqs:[],
    effect:{ unlockChassis:'SUPPLY_TRUCK' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // AIR
  // ═══════════════════════════════════════════════════════════════════════════

  fuel_tanks: {
    id:'fuel_tanks', branch:'air', tier:0, kind:'stat',
    name:'Extended Fuel Tanks',
    desc:'All air units +2 max fuel.',
    cost:20, prereqs:[],
    effect:{ unitStatBonus:{
      BIPLANE_FIGHTER:{ fuelMax:2 },
      LIGHT_BOMBER:   { fuelMax:2 },
      OBS_PLANE:      { fuelMax:2 },
    }},
  },
  drop_tanks: {
    id:'drop_tanks', branch:'air', tier:1, kind:'module',
    name:'Drop Tank Kit',
    desc:'🔩 MODULE — Airframe add-on: +move/+fuel at slight durability cost.',
    cost:18, prereqs:['fuel_tanks'],
    effect:{ unlockModule:'AIR_DROP_TANKS' },
  },
  biplane_upgrade: {
    id:'biplane_upgrade', branch:'air', tier:0, kind:'stat',
    name:'Biplane Upgrade Kit',
    desc:'Biplane fighters +1 move, +1 soft attack. Bridge tech before monoplanes.',
    cost:15, prereqs:[],
    effect:{ unitStatBonus:{ BIPLANE_FIGHTER:{ move:1, soft_attack:1 } } },
  },
  obs_plane_camera: {
    id:'obs_plane_camera', branch:'air', tier:0, kind:'stat',
    name:'Recon Camera (Basic)',
    desc:'Observation planes sight +2 and reveal enemy units within vision for 1 turn after overfly.',
    cost:15, prereqs:[],
    effect:{ unitStatBonus:{ OBS_PLANE:{ sight:2 } } },
  },
  monoplane_fighter: {
    id:'monoplane_fighter', branch:'air', tier:1, kind:'chassis',
    name:'Monoplane Fighter',
    desc:'🔓 NEW CHASSIS — Faster, more maneuverable than the biplane. Superior air-to-air.',
    cost:40, prereqs:['fuel_tanks'],
    effect:{ unlockChassis:'MONOPLANE_FIGHTER' },
  },
  dive_bomber: {
    id:'dive_bomber', branch:'air', tier:1, kind:'chassis',
    name:'Dive Bomber',
    desc:'🔓 NEW CHASSIS — Precision attack bomber. High accuracy vs. ground targets.',
    cost:40, prereqs:['fuel_tanks'],
    effect:{ unlockChassis:'DIVE_BOMBER' },
  },
  air_radio: {
    id:'air_radio', branch:'air', tier:1, kind:'stat',
    name:'Air-Ground Radio',
    desc:'Aircraft can spot for artillery. Pilots relay coordinates (+2 sight shared).',
    cost:20, prereqs:['biplane_upgrade'],
    effect:{ unitStatBonus:{ BIPLANE_FIGHTER:{ sight:1 }, MONOPLANE_FIGHTER:{ sight:1 }, OBS_PLANE:{ sight:2 } } },
  },
  heavy_bomber: {
    id:'heavy_bomber', branch:'air', tier:2, kind:'chassis',
    name:'Heavy Bomber',
    desc:'🔓 NEW CHASSIS — Long-range strategic bomber. High damage, slow, short fuel.',
    cost:60, prereqs:['dive_bomber', 'monoplane_fighter'],
    effect:{ unlockChassis:'HEAVY_BOMBER' },
  },
  airfield_efficiency: {
    id:'airfield_efficiency', branch:'air', tier:1, kind:'stat',
    name:'Airfield Operations',
    desc:'Aircraft built at airfields take 1 fewer turn to produce.',
    cost:20, prereqs:['biplane_upgrade'],
    effect:{ buildingBonus:{ AIRFIELD:{ buildTimeBonus:1 } } },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NAVAL
  // ═══════════════════════════════════════════════════════════════════════════

  naval_gunnery: {
    id:'naval_gunnery', branch:'naval', tier:0, kind:'stat',
    name:'Naval Gunnery',
    desc:'All surface ships +1 hard attack.',
    cost:25, prereqs:[],
    effect:{ unitStatBonus:{
      DESTROYER:  { hard_attack:1 },
      CRUISER_LT: { hard_attack:1 },
      CRUISER_HV: { hard_attack:1 },
      BATTLESHIP: { hard_attack:1 },
    }},
  },
  torpedo_upgrade: {
    id:'torpedo_upgrade', branch:'naval', tier:0, kind:'stat',
    name:'Improved Torpedo',
    desc:'Torpedo craft and submarines: hard attack +1, pierce +1.',
    cost:20, prereqs:[],
    effect:{ unitStatBonus:{ MTB:{ hard_attack:1, pierce:1 }, SUBMARINE:{ hard_attack:1, pierce:1 } } },
  },
  dive_protocol: {
    id:'dive_protocol', branch:'naval', tier:0, kind:'stat',
    name:'Dive Protocol Mk.I',
    desc:'Submarines submerge in 1 turn. Evasion +2 when submerged.',
    cost:20, prereqs:[],
    effect:{ unitStatBonus:{ SUBMARINE:{ evasion:2, defense:1 } } },
  },
  torpedo_boat: {
    id:'torpedo_boat', branch:'naval', tier:1, kind:'chassis',
    name:'Torpedo Boat',
    desc:'🔓 NEW CHASSIS — Fast attack craft: Move 10, torpedo tubes, no armor.',
    cost:30, prereqs:['torpedo_upgrade'],
    effect:{ unlockChassis:'TORPEDO_BOAT' },
  },
  motor_gunboat: {
    id:'motor_gunboat', branch:'naval', tier:1, kind:'chassis',
    name:'Motor Gunboat',
    desc:'🔓 NEW CHASSIS — Coastal patrol upgrade: 40mm gun + HMG. Better firepower.',
    cost:25, prereqs:['naval_gunnery'],
    effect:{ unlockChassis:'MOTOR_GUNBOAT' },
  },
  destroyer_mk1: {
    id:'destroyer_mk1', branch:'naval', tier:1, kind:'chassis',
    name:'Destroyer Mk.I',
    desc:'🔓 NEW CHASSIS — Fleet destroyer: 4× guns, torpedo tubes, Move 8.',
    cost:35, prereqs:['naval_gunnery', 'torpedo_upgrade'],
    effect:{ unlockChassis:'DESTROYER_MK1' },
  },
  asdic_sonar: {
    id:'asdic_sonar', branch:'naval', tier:1, kind:'stat',
    name:'ASDIC Basic Sonar',
    desc:'Destroyers can detect submarines within 3 hexes.',
    cost:25, prereqs:['destroyer_mk1'],
    effect:{ unitStatBonus:{ DESTROYER:{ sonarRange:3 }, DESTROYER_MK1:{ sonarRange:3 } } },
  },
  sub_extended_range: {
    id:'sub_extended_range', branch:'naval', tier:1, kind:'stat',
    name:'Extended Sub Fuel Tanks',
    desc:'Submarines operational range +3 hexes.',
    cost:25, prereqs:['dive_protocol'],
    effect:{ unitStatBonus:{ SUBMARINE:{ move:1, fuelMax:3 } } },
  },
  coastal_rangefinder: {
    id:'coastal_rangefinder', branch:'naval', tier:1, kind:'stat',
    name:'Coastal Rangefinder Network',
    desc:'Coastal Batteries get +1 range and +2 accuracy.',
    cost:20, prereqs:['naval_gunnery'],
    effect:{ unitStatBonus:{ COASTAL_BATTERY:{ range:1, accuracy:2 } } },
  },
  coastal_fire_control: {
    id:'coastal_fire_control', branch:'naval', tier:2, kind:'stat',
    name:'Coastal Fire Control',
    desc:'Coastal Batteries get +1 hard attack and +1 naval attack.',
    cost:28, prereqs:['coastal_rangefinder'],
    effect:{ unitStatBonus:{ COASTAL_BATTERY:{ hard_attack:1, naval_attack:1 } } },
  },
  carrier: {
    id:'carrier', branch:'naval', tier:2, kind:'chassis',
    name:'Aircraft Carrier',
    desc:'🔓 NEW CHASSIS — Floating airfield. Air units can refuel and rearm at sea.',
    cost:80, prereqs:['naval_gunnery', 'destroyer_mk1'],
    effect:{ unlockChassis:'CARRIER' },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // ENGINEERING
  // ═══════════════════════════════════════════════════════════════════════════

  pontoon_bridge: {
    id:'pontoon_bridge', branch:'engineering', tier:0, kind:'building',
    name:'Pontoon Bridge',
    desc:'🏗 BUILDING — Engineers can build Pontoon Bridges over shallow water.',
    cost:25, prereqs:[],
    effect:{ unlockBuilding:'PONTOON_BRIDGE' },
  },
  barbed_wire: {
    id:'barbed_wire', branch:'engineering', tier:0, kind:'building',
    name:'Barbed Wire Entanglement',
    desc:'🏗 BUILDING — Wire obstacle: costs infantry +1 move to enter hex.',
    cost:10, prereqs:[],
    effect:{ unlockBuilding:'BARBED_WIRE' },
  },
  sandbag_improved: {
    id:'sandbag_improved', branch:'engineering', tier:0, kind:'building',
    name:'Sandbag Emplacement',
    desc:'🏗 BUILDING — Improved fortification: +2 defense for garrisoned unit.',
    cost:15, prereqs:[],
    effect:{ unlockBuilding:'SANDBAG' },
  },
  signal_flare: {
    id:'signal_flare', branch:'engineering', tier:1, kind:'doctrine',
    name:'Signal Flare System',
    desc:'Artillery can fire on a hex without a spotter (low accuracy area bombardment).',
    cost:15, prereqs:['sandbag_improved'],
    effect:{ unlockBlindFire:true },
  },
  at_ditch: {
    id:'at_ditch', branch:'engineering', tier:1, kind:'building',
    name:'Anti-Tank Ditch',
    desc:'🏗 BUILDING — Engineers can dig AT Ditches — impassable to vehicles.',
    cost:20, prereqs:['pontoon_bridge'],
    effect:{ unlockBuilding:'AT_DITCH' },
  },
  field_fortifications: {
    id:'field_fortifications', branch:'engineering', tier:1, kind:'stat',
    name:'Field Fortification Doctrine',
    desc:'Bunkers and trenches give +1 extra defense bonus.',
    cost:30, prereqs:['pontoon_bridge'],
    effect:{ buildingBonus:{ BUNKER:{ defenseBonus:1 }, TRENCH:{ defenseBonus:1 } } },
  },
  bunker: {
    id:'bunker', branch:'engineering', tier:2, kind:'building',
    name:'Concrete Bunker',
    desc:'🏗 BUILDING — Permanent fortification: +6 defense, HP 10. Survives artillery.',
    cost:35, prereqs:['field_fortifications'],
    effect:{ unlockBuilding:'BUNKER' },
  },
  supply_depot: {
    id:'supply_depot', branch:'engineering', tier:2, kind:'building',
    name:'Supply Depot',
    desc:'🏗 BUILDING — Field supply depot: units within 3 hexes resupply +1 move.',
    cost:30, prereqs:['field_fortifications'],
    effect:{ unlockBuilding:'SUPPLY_DEPOT' },
  },
  aa_targeting_drill: {
    id:'aa_targeting_drill', branch:'engineering', tier:1, kind:'stat',
    name:'AA Targeting Drill',
    desc:'AA Emplacements gain +1 range and +2 accuracy.',
    cost:18, prereqs:['sandbag_improved'],
    effect:{ unitStatBonus:{ AA_EMPLACEMENT:{ range:1, accuracy:2 } } },
  },
  aa_he_burst: {
    id:'aa_he_burst', branch:'engineering', tier:2, kind:'stat',
    name:'AA HE-Burst Fuse',
    desc:'AA Emplacements gain +1 hard attack and +1 soft attack vs low-altitude targets.',
    cost:26, prereqs:['aa_targeting_drill'],
    effect:{ unitStatBonus:{ AA_EMPLACEMENT:{ hard_attack:1, soft_attack:1 } } },
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCIENCE
  // ═══════════════════════════════════════════════════════════════════════════

  scientific_method: {
    id:'scientific_method', branch:'science', tier:0, kind:'research',
    name:'Scientific Method Protocols',
    desc:'Standardized experiments. RP generation +10% per Science Lab.',
    cost:15, prereqs:[],
    effect:{ rpBonusPerLab:1 },
  },
  research_library: {
    id:'research_library', branch:'science', tier:0, kind:'research',
    name:'Research Library',
    desc:'Full tech tree visible. All Tier 1 research costs −5% (rounded down).',
    cost:20, prereqs:[],
    effect:{ globalResearchCostBonus:-0.05 },
  },
  inter_department: {
    id:'inter_department', branch:'science', tier:1, kind:'research',
    name:'Inter-Department Communication',
    desc:'Unlocks a 2nd simultaneous research slot.',
    cost:35, prereqs:['scientific_method'],
    effect:{ extraResearchSlots:1 },
  },
  dual_research: {
    id:'dual_research', branch:'science', tier:1, kind:'research',
    name:'Parallel Research',
    desc:'Unlocks a 3rd simultaneous research slot.',
    cost:40, prereqs:['inter_department', 'research_library'],
    effect:{ extraResearchSlots:1 },
  },
  scientific_procurement: {
    id:'scientific_procurement', branch:'science', tier:1, kind:'research',
    name:'Scientific Procurement',
    desc:'Bulk equipment purchasing. All Tier 1 research costs −10% further.',
    cost:20, prereqs:['research_library'],
    effect:{ globalResearchCostBonus:-0.10 },
  },
  applied_research: {
    id:'applied_research', branch:'science', tier:2, kind:'research',
    name:'Applied Research Institute',
    desc:'RP generation +15% per Science Lab (cumulative).',
    cost:50, prereqs:['scientific_method', 'inter_department'],
    effect:{ rpBonusPerLab:2 },
  },
  triple_research: {
    id:'triple_research', branch:'science', tier:2, kind:'research',
    name:'Research Division',
    desc:'Unlocks a 4th simultaneous research slot.',
    cost:60, prereqs:['dual_research'],
    effect:{ extraResearchSlots:1 },
  },
};

// ── Utility functions ────────────────────────────────────────────────────────

export function techsByBranch(branch) {
  return Object.values(TECH_TREE).filter(t => t.branch === branch);
}

export function prereqsMet(techId, unlockedSet) {
  const tech = TECH_TREE[techId];
  if (!tech) return false;
  return tech.prereqs.every(p => unlockedSet.has(p));
}

export function computeTechBonuses(unlockedArr) {
  const unlockedSet = unlockedArr instanceof Set ? unlockedArr : new Set(unlockedArr);
  const bonuses = {
    buildingBonus:         {},
    unitStatBonus:         {},
    globalBuildTimeBonus:  0,
    rpBonusPerLab:         0,
    extraResearchSlots:    0,
    unlockedBuildings:     new Set(),
    unlockedChassis:       new Set(),
    unlockedModules:       new Set(),
    globalTrainCostBonus:  {},
    globalResearchCostBonus: 0,
  };
  for (const techId of unlockedSet) {
    const tech = TECH_TREE[techId];
    if (!tech) continue;
    const e = tech.effect;
    if (e.buildingBonus) {
      for (const [bt, delta] of Object.entries(e.buildingBonus)) {
        if (!bonuses.buildingBonus[bt]) bonuses.buildingBonus[bt] = {};
        for (const [k, v] of Object.entries(delta))
          bonuses.buildingBonus[bt][k] = (bonuses.buildingBonus[bt][k] || 0) + v;
      }
    }
    if (e.unitStatBonus) {
      for (const [ut, delta] of Object.entries(e.unitStatBonus)) {
        if (!bonuses.unitStatBonus[ut]) bonuses.unitStatBonus[ut] = {};
        for (const [k, v] of Object.entries(delta))
          bonuses.unitStatBonus[ut][k] = (bonuses.unitStatBonus[ut][k] || 0) + v;
      }
    }
    if (e.globalBuildTimeBonus)     bonuses.globalBuildTimeBonus    += e.globalBuildTimeBonus;
    if (e.rpBonusPerLab)            bonuses.rpBonusPerLab           += e.rpBonusPerLab;
    if (e.extraResearchSlots)       bonuses.extraResearchSlots      += e.extraResearchSlots;
    if (e.globalResearchCostBonus)  bonuses.globalResearchCostBonus += e.globalResearchCostBonus;
    if (e.unlockBuilding)           bonuses.unlockedBuildings.add(e.unlockBuilding);
    if (e.unlockChassis)            bonuses.unlockedChassis.add(e.unlockChassis);
    if (e.unlockModule)             bonuses.unlockedModules.add(e.unlockModule);
    if (e.globalTrainCostBonus) {
      for (const [k, v] of Object.entries(e.globalTrainCostBonus))
        bonuses.globalTrainCostBonus[k] = (bonuses.globalTrainCostBonus[k] || 0) + v;
    }
  }
  return bonuses;
}
