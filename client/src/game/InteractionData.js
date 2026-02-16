/**
 * InteractionData.js — Master list of every action a family member can perform.
 *
 * Each interaction is tied to a specific furniture item (or room / exterior feature)
 * and defines:
 *   id            – unique key
 *   furnitureId   – matching id from HOUSE_LAYOUT.furniture[] (or '_room_<id>' / '_exterior_<id>')
 *   label         – human-readable action description
 *   room          – room id where this happens
 *   duration      – { min, max } in GAME MINUTES (the AI picks a random value in range)
 *   timeWindow    – optional { start, end } game-hour range (0-24); null = anytime
 *   eligibleRoles – which family members can do it; null = everyone
 *   animation     – hint string for the sprite system (future use)
 *   category      – grouping tag for weighting / scheduling
 *   priority      – base weight (higher = more likely to be chosen by AI)
 *   description   – flavor text explaining the action
 */

// Helper: all roles
const ALL = null; // null means every family member
const ADULTS = ['father', 'mother'];
const KIDS = ['son', 'daughter'];
const DAD = ['father'];
const MOM = ['mother'];

export const INTERACTION_CATALOG = [

  // ═══════════════════════════════════════════════════════════════════
  //  KITCHEN
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'cook_breakfast',
    furnitureId: 'stove',
    label: 'Cook breakfast',
    room: 'kitchen',
    duration: { min: 10, max: 20 },
    timeWindow: { start: 6, end: 9 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'cooking',
    priority: 8,
    description: 'Prepare eggs, bacon, and toast on the stove for the family.'
  },
  {
    id: 'cook_lunch',
    furnitureId: 'stove',
    label: 'Cook lunch',
    room: 'kitchen',
    duration: { min: 10, max: 20 },
    timeWindow: { start: 11, end: 13 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'cooking',
    priority: 6,
    description: 'Prepare a quick lunch on the stove.'
  },
  {
    id: 'cook_dinner',
    furnitureId: 'stove',
    label: 'Cook dinner',
    room: 'kitchen',
    duration: { min: 20, max: 40 },
    timeWindow: { start: 17, end: 19 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'cooking',
    priority: 9,
    description: 'Prepare a full dinner on the stove for the whole family.'
  },
  {
    id: 'heat_food_microwave',
    furnitureId: 'microwave',
    label: 'Microwave food',
    room: 'kitchen',
    duration: { min: 2, max: 5 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'cooking',
    priority: 4,
    description: 'Reheat leftovers or cook a quick snack in the microwave.'
  },
  {
    id: 'get_drink_fridge',
    furnitureId: 'fridge',
    label: 'Get a drink',
    room: 'kitchen',
    duration: { min: 1, max: 3 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'eating',
    priority: 5,
    description: 'Open the fridge and grab a cold drink.'
  },
  {
    id: 'get_snack_fridge',
    furnitureId: 'fridge',
    label: 'Get a snack',
    room: 'kitchen',
    duration: { min: 2, max: 5 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'eating',
    priority: 4,
    description: 'Rummage through the fridge for a snack.'
  },
  {
    id: 'get_pantry_item',
    furnitureId: 'pantry',
    label: 'Browse the pantry',
    room: 'kitchen',
    duration: { min: 1, max: 3 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'eating',
    priority: 3,
    description: 'Look through the pantry shelves for ingredients or a quick bite.'
  },
  {
    id: 'wash_dishes_sink',
    furnitureId: 'sink',
    label: 'Wash dishes',
    room: 'kitchen',
    duration: { min: 5, max: 15 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 4,
    description: 'Scrub pots, pans, and plates in the kitchen sink.'
  },
  {
    id: 'wash_hands_kitchen',
    furnitureId: 'sink',
    label: 'Wash hands',
    room: 'kitchen',
    duration: { min: 1, max: 2 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 3,
    description: 'Quickly rinse hands in the kitchen sink.'
  },
  {
    id: 'run_dishwasher',
    furnitureId: 'dishwasher',
    label: 'Run the dishwasher',
    room: 'kitchen',
    duration: { min: 2, max: 5 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 3,
    description: 'Load and start the dishwasher after a meal.'
  },
  {
    id: 'unload_dishwasher',
    furnitureId: 'dishwasher',
    label: 'Unload the dishwasher',
    room: 'kitchen',
    duration: { min: 5, max: 10 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'chores',
    priority: 3,
    description: 'Put clean dishes away from the dishwasher.'
  },
  {
    id: 'eat_at_table',
    furnitureId: 'kitchen_table',
    label: 'Eat a meal',
    room: 'kitchen',
    duration: { min: 10, max: 25 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'eating',
    priority: 7,
    description: 'Sit at the kitchen table and eat a meal.'
  },
  {
    id: 'sit_at_table_chat',
    furnitureId: 'kitchen_table',
    label: 'Chat at the table',
    room: 'kitchen',
    duration: { min: 5, max: 15 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'social',
    priority: 4,
    description: 'Sit at the kitchen table and chat with family.'
  },
  {
    id: 'sit_kitchen_chair',
    furnitureId: 'kitchen_chair_1',
    label: 'Sit in chair',
    room: 'kitchen',
    duration: { min: 5, max: 15 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'relaxing',
    priority: 2,
    description: 'Pull up a kitchen chair and rest for a bit.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  LIVING ROOM
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'watch_tv',
    furnitureId: 'tv',
    label: 'Watch TV',
    room: 'living_room',
    duration: { min: 15, max: 60 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'entertainment',
    priority: 8,
    description: 'Sit on the couch and watch shows or movies on TV.'
  },
  {
    id: 'watch_morning_news',
    furnitureId: 'tv',
    label: 'Watch morning news',
    room: 'living_room',
    duration: { min: 15, max: 30 },
    timeWindow: { start: 6, end: 9 },
    eligibleRoles: ADULTS,
    animation: 'sit',
    category: 'entertainment',
    priority: 5,
    description: 'Catch up on the morning news before the day begins.'
  },
  {
    id: 'sit_on_couch',
    furnitureId: 'couch',
    label: 'Relax on the couch',
    room: 'living_room',
    duration: { min: 10, max: 30 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'relaxing',
    priority: 6,
    description: 'Sit on the couch and relax for a while.'
  },
  {
    id: 'nap_on_couch',
    furnitureId: 'couch',
    label: 'Nap on the couch',
    room: 'living_room',
    duration: { min: 30, max: 90 },
    timeWindow: { start: 12, end: 17 },
    eligibleRoles: ADULTS,
    animation: 'sleep',
    category: 'sleeping',
    priority: 3,
    description: 'Doze off on the couch for an afternoon nap.'
  },
  {
    id: 'sit_loveseat',
    furnitureId: 'loveseat',
    label: 'Sit on loveseat',
    room: 'living_room',
    duration: { min: 10, max: 30 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'relaxing',
    priority: 4,
    description: 'Settle into the loveseat for some quiet time.'
  },
  {
    id: 'read_book',
    furnitureId: 'bookshelf',
    label: 'Read a book',
    room: 'living_room',
    duration: { min: 15, max: 60 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'entertainment',
    priority: 5,
    description: 'Grab a book off the shelf and sit on the couch to read.'
  },
  {
    id: 'browse_coffee_table',
    furnitureId: 'coffee_table',
    label: 'Look at magazines',
    room: 'living_room',
    duration: { min: 5, max: 15 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'entertainment',
    priority: 2,
    description: 'Sit on the couch and flip through magazines from the coffee table.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  MASTER BEDROOM
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'sleep_night',
    furnitureId: 'master_bed',
    label: 'Sleep for the night',
    room: 'bedroom_master',
    duration: { min: 360, max: 540 },   // 6-9 hours
    timeWindow: { start: 21, end: 6 },  // 9 PM – 6 AM (wraps midnight)
    eligibleRoles: ADULTS,
    animation: 'sleep',
    category: 'sleeping',
    priority: 10,
    description: 'Go to bed for the night. Will wake up between 5 AM and 7 AM.'
  },
  {
    id: 'nap_daytime',
    furnitureId: 'master_bed',
    label: 'Take a nap',
    room: 'bedroom_master',
    duration: { min: 60, max: 180 },    // 1-3 hours
    timeWindow: { start: 12, end: 16 },
    eligibleRoles: ADULTS,
    animation: 'sleep',
    category: 'sleeping',
    priority: 4,
    description: 'Lie down for a midday nap.'
  },
  {
    id: 'make_bed',
    furnitureId: 'master_bed',
    label: 'Make the bed',
    room: 'bedroom_master',
    duration: { min: 3, max: 5 },
    timeWindow: { start: 6, end: 10 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 3,
    description: 'Straighten the sheets and fluff the pillows.'
  },
  {
    id: 'get_dressed_dresser',
    furnitureId: 'dresser',
    label: 'Get dressed',
    room: 'bedroom_master',
    duration: { min: 3, max: 8 },
    timeWindow: { start: 5, end: 9 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'hygiene',
    priority: 7,
    description: 'Pick out clothes from the dresser and get dressed.'
  },
  {
    id: 'put_away_clothes_dresser',
    furnitureId: 'dresser',
    label: 'Put away clothes',
    room: 'bedroom_master',
    duration: { min: 5, max: 10 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Fold and stash clean laundry in the dresser.'
  },
  {
    id: 'get_outfit_wardrobe',
    furnitureId: 'wardrobe',
    label: 'Pick an outfit',
    room: 'bedroom_master',
    duration: { min: 3, max: 10 },
    timeWindow: { start: 5, end: 9 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'hygiene',
    priority: 4,
    description: 'Browse hanging clothes in the wardrobe.'
  },
  {
    id: 'set_alarm_nightstand',
    furnitureId: 'nightstand_l',
    label: 'Set alarm clock',
    room: 'bedroom_master',
    duration: { min: 1, max: 2 },
    timeWindow: { start: 20, end: 23 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'routine',
    priority: 3,
    description: 'Set the alarm on the nightstand before bed.'
  },
  {
    id: 'read_in_bed',
    furnitureId: 'master_bed',
    label: 'Read in bed',
    room: 'bedroom_master',
    duration: { min: 10, max: 30 },
    timeWindow: { start: 20, end: 23 },
    eligibleRoles: ADULTS,
    animation: 'sit',
    category: 'entertainment',
    priority: 4,
    description: 'Sit up in bed and read a book before sleep.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  BATHROOM
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'use_toilet',
    furnitureId: 'toilet',
    label: 'Use the toilet',
    room: 'bathroom',
    duration: { min: 2, max: 8 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'hygiene',
    priority: 6,
    description: 'Nature calls — use the toilet.'
  },
  {
    id: 'take_shower',
    furnitureId: 'shower',
    label: 'Take a shower',
    room: 'bathroom',
    duration: { min: 8, max: 20 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 7,
    description: 'Step into the shower and get clean.'
  },
  {
    id: 'morning_shower',
    furnitureId: 'shower',
    label: 'Morning shower',
    room: 'bathroom',
    duration: { min: 10, max: 15 },
    timeWindow: { start: 5, end: 9 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 8,
    description: 'Fresh morning shower to start the day.'
  },
  {
    id: 'wash_hands_bathroom',
    furnitureId: 'bath_sink',
    label: 'Wash hands',
    room: 'bathroom',
    duration: { min: 1, max: 2 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 4,
    description: 'Wash hands at the bathroom sink.'
  },
  {
    id: 'brush_teeth',
    furnitureId: 'bath_sink',
    label: 'Brush teeth',
    room: 'bathroom',
    duration: { min: 2, max: 4 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 7,
    description: 'Brush teeth at the sink — morning and night routine.'
  },
  {
    id: 'morning_teeth',
    furnitureId: 'bath_sink',
    label: 'Brush teeth (morning)',
    room: 'bathroom',
    duration: { min: 2, max: 4 },
    timeWindow: { start: 5, end: 9 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 8,
    description: 'Morning tooth-brushing routine at the sink.'
  },
  {
    id: 'night_teeth',
    furnitureId: 'bath_sink',
    label: 'Brush teeth (bedtime)',
    room: 'bathroom',
    duration: { min: 2, max: 4 },
    timeWindow: { start: 20, end: 23 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 8,
    description: 'Brush teeth before bed.'
  },
  {
    id: 'check_mirror',
    furnitureId: 'bath_mirror',
    label: 'Check appearance',
    room: 'bathroom',
    duration: { min: 1, max: 5 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'hygiene',
    priority: 2,
    description: 'Look in the mirror — fix hair, check outfit, etc.'
  },
  {
    id: 'do_makeup',
    furnitureId: 'bath_mirror',
    label: 'Do makeup',
    room: 'bathroom',
    duration: { min: 5, max: 15 },
    timeWindow: { start: 6, end: 10 },
    eligibleRoles: MOM,
    animation: 'use',
    category: 'hygiene',
    priority: 5,
    description: 'Apply makeup in front of the bathroom mirror.'
  },
  {
    id: 'shave',
    furnitureId: 'bath_mirror',
    label: 'Shave',
    room: 'bathroom',
    duration: { min: 5, max: 10 },
    timeWindow: { start: 5, end: 9 },
    eligibleRoles: DAD,
    animation: 'use',
    category: 'hygiene',
    priority: 5,
    description: 'Morning shave at the mirror.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  LAUNDRY ROOM
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'do_laundry_wash',
    furnitureId: 'washer',
    label: 'Start a wash cycle',
    room: 'laundry',
    duration: { min: 3, max: 5 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 5,
    description: 'Load dirty clothes into the washing machine and start the cycle.'
  },
  {
    id: 'switch_laundry_dryer',
    furnitureId: 'dryer',
    label: 'Move clothes to dryer',
    room: 'laundry',
    duration: { min: 3, max: 5 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 5,
    description: 'Transfer wet clothes from the washer to the dryer.'
  },
  {
    id: 'fold_laundry',
    furnitureId: 'folding_table',
    label: 'Fold laundry',
    room: 'laundry',
    duration: { min: 10, max: 25 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 5,
    description: 'Fold clean clothes on the folding table.'
  },
  {
    id: 'sort_laundry',
    furnitureId: 'laundry_basket',
    label: 'Sort dirty laundry',
    room: 'laundry',
    duration: { min: 3, max: 8 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 3,
    description: 'Separate lights, darks, and delicates into baskets.'
  },
  {
    id: 'sort_colors',
    furnitureId: 'laundry_basket_2',
    label: 'Sort by color',
    room: 'laundry',
    duration: { min: 3, max: 5 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Separate clothes by color into the sorting basket.'
  },
  {
    id: 'iron_clothes',
    furnitureId: 'ironing_board',
    label: 'Iron clothes',
    room: 'laundry',
    duration: { min: 10, max: 20 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 3,
    description: 'Press wrinkles out of shirts and pants on the ironing board.'
  },
  {
    id: 'steam_press_clothes',
    furnitureId: 'steam_press',
    label: 'Steam press a shirt',
    room: 'laundry',
    duration: { min: 5, max: 10 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Use the steam press for a crisp finish on dress clothes.'
  },
  {
    id: 'hang_clothes_dry',
    furnitureId: 'drying_rack',
    label: 'Hang clothes to dry',
    room: 'laundry',
    duration: { min: 5, max: 10 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 3,
    description: 'Hang delicates on the drying rack.'
  },
  {
    id: 'get_cleaning_supplies',
    furnitureId: 'laundry_shelf',
    label: 'Get cleaning supplies',
    room: 'laundry',
    duration: { min: 1, max: 3 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Grab detergent, bleach, or cleaning sprays from the supply shelf.'
  },
  {
    id: 'hand_wash_utility',
    furnitureId: 'utility_sink',
    label: 'Hand-wash delicates',
    room: 'laundry',
    duration: { min: 5, max: 15 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Gently hand-wash delicate items in the utility sink.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  SHARED KIDS ROOM
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'kids_sleep_night_1',
    furnitureId: 'kids_bed_1',
    label: 'Go to sleep',
    room: 'bedroom_kids_shared',
    duration: { min: 480, max: 600 },   // 8-10 hours
    timeWindow: { start: 20, end: 7 },
    eligibleRoles: ['daughter'],
    animation: 'sleep',
    category: 'sleeping',
    priority: 10,
    description: 'Daughter tucks in for the night in Bed 1.'
  },
  {
    id: 'kids_sleep_night_2',
    furnitureId: 'kids_bed_2',
    label: 'Go to sleep',
    room: 'bedroom_kids_shared',
    duration: { min: 480, max: 600 },
    timeWindow: { start: 20, end: 7 },
    eligibleRoles: ['daughter'],
    animation: 'sleep',
    category: 'sleeping',
    priority: 10,
    description: 'Daughter tucks in for the night in Bed 2.'
  },
  {
    id: 'kids_nap_1',
    furnitureId: 'kids_bed_1',
    label: 'Take a nap',
    room: 'bedroom_kids_shared',
    duration: { min: 30, max: 90 },
    timeWindow: { start: 13, end: 16 },
    eligibleRoles: KIDS,
    animation: 'sleep',
    category: 'sleeping',
    priority: 2,
    description: 'Lie down for an afternoon nap.'
  },
  {
    id: 'play_with_toys',
    furnitureId: 'toy_box',
    label: 'Play with toys',
    room: 'bedroom_kids_shared',
    duration: { min: 15, max: 45 },
    timeWindow: null,
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'entertainment',
    priority: 7,
    description: 'Dig through the toy box and play with action figures, dolls, or blocks.'
  },
  {
    id: 'do_homework_shared',
    furnitureId: 'kids_desk_shared',
    label: 'Do homework',
    room: 'bedroom_kids_shared',
    duration: { min: 15, max: 45 },
    timeWindow: { start: 15, end: 20 },
    eligibleRoles: KIDS,
    animation: 'sit',
    category: 'education',
    priority: 6,
    description: 'Sit at the desk and work on school assignments.'
  },
  {
    id: 'draw_at_desk_shared',
    furnitureId: 'kids_desk_shared',
    label: 'Draw pictures',
    room: 'bedroom_kids_shared',
    duration: { min: 10, max: 30 },
    timeWindow: null,
    eligibleRoles: KIDS,
    animation: 'sit',
    category: 'entertainment',
    priority: 4,
    description: 'Get creative and draw at the desk.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  SINGLE KIDS ROOM
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'kids_sleep_night_3',
    furnitureId: 'kids_bed_3',
    label: 'Go to sleep',
    room: 'bedroom_kids_single',
    duration: { min: 480, max: 600 },
    timeWindow: { start: 20, end: 7 },
    eligibleRoles: ['son'],
    animation: 'sleep',
    category: 'sleeping',
    priority: 10,
    description: 'Son goes to bed for the night.'
  },
  {
    id: 'kids_nap_3',
    furnitureId: 'kids_bed_3',
    label: 'Take a nap',
    room: 'bedroom_kids_single',
    duration: { min: 30, max: 90 },
    timeWindow: { start: 13, end: 16 },
    eligibleRoles: ['son'],
    animation: 'sleep',
    category: 'sleeping',
    priority: 2,
    description: 'Afternoon nap in the single kids room.'
  },
  {
    id: 'do_homework_single',
    furnitureId: 'kids_desk_single',
    label: 'Do homework',
    room: 'bedroom_kids_single',
    duration: { min: 15, max: 45 },
    timeWindow: { start: 15, end: 20 },
    eligibleRoles: ['son'],
    animation: 'sit',
    category: 'education',
    priority: 6,
    description: 'Sit at the desk and grind through homework.'
  },
  {
    id: 'play_video_games_desk',
    furnitureId: 'kids_desk_single',
    label: 'Play video games',
    room: 'bedroom_kids_single',
    duration: { min: 15, max: 60 },
    timeWindow: null,
    eligibleRoles: ['son'],
    animation: 'sit',
    category: 'entertainment',
    priority: 6,
    description: 'Game time at the desk.'
  },
  {
    id: 'read_kids_book',
    furnitureId: 'bean_bag',
    label: 'Read a book',
    room: 'bedroom_kids_single',
    duration: { min: 10, max: 30 },
    timeWindow: null,
    eligibleRoles: KIDS,
    animation: 'sit',
    category: 'education',
    priority: 4,
    description: 'Grab a book and sit on the bean bag to read.'
  },
  {
    id: 'sit_bean_bag',
    furnitureId: 'bean_bag',
    label: 'Chill on bean bag',
    room: 'bedroom_kids_single',
    duration: { min: 10, max: 30 },
    timeWindow: null,
    eligibleRoles: KIDS,
    animation: 'sit',
    category: 'relaxing',
    priority: 4,
    description: 'Flop into the bean bag chair and relax.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  MASTER CLOSET
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'pick_clothes_closet',
    furnitureId: 'master_clothes_rod_l',
    label: 'Pick out clothes',
    room: 'closet_master',
    duration: { min: 3, max: 10 },
    timeWindow: { start: 5, end: 9 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'hygiene',
    priority: 5,
    description: 'Browse the hanging clothes and pick an outfit.'
  },
  {
    id: 'hang_clothes_closet',
    furnitureId: 'master_clothes_rod_r',
    label: 'Hang up clothes',
    room: 'closet_master',
    duration: { min: 3, max: 8 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 3,
    description: 'Hang freshly laundered clothes back on the rod.'
  },
  {
    id: 'pick_shoes',
    furnitureId: 'master_shoe_rack',
    label: 'Pick shoes',
    room: 'closet_master',
    duration: { min: 1, max: 3 },
    timeWindow: { start: 5, end: 9 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'hygiene',
    priority: 3,
    description: 'Choose shoes from the rack to match the outfit.'
  },
  {
    id: 'check_outfit_mirror',
    furnitureId: 'master_mirror',
    label: 'Check outfit in mirror',
    room: 'closet_master',
    duration: { min: 1, max: 5 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'hygiene',
    priority: 2,
    description: 'Do a full-body outfit check in the full-length mirror.'
  },
  {
    id: 'get_storage_item',
    furnitureId: 'master_storage_box',
    label: 'Rummage in storage',
    room: 'closet_master',
    duration: { min: 2, max: 5 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 1,
    description: 'Search through the storage box for seasonal items.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  KIDS CLOSET
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'kids_pick_clothes',
    furnitureId: 'kids_clothes_rod_1',
    label: 'Pick out clothes',
    room: 'closet_kids',
    duration: { min: 2, max: 8 },
    timeWindow: { start: 6, end: 9 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'hygiene',
    priority: 5,
    description: 'Choose an outfit for the day from the closet rod.'
  },
  {
    id: 'kids_hang_clothes',
    furnitureId: 'kids_clothes_rod_2',
    label: 'Hang up clothes',
    room: 'closet_kids',
    duration: { min: 2, max: 5 },
    timeWindow: null,
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Put clean clothes back on the rod (with some help).'
  },
  {
    id: 'kids_pick_shoes',
    furnitureId: 'kids_shoe_rack',
    label: 'Pick shoes',
    room: 'closet_kids',
    duration: { min: 1, max: 3 },
    timeWindow: { start: 6, end: 9 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'hygiene',
    priority: 3,
    description: 'Grab a pair of shoes from the rack.'
  },
  {
    id: 'play_dress_up',
    furnitureId: 'kids_costume_box',
    label: 'Play dress-up',
    room: 'closet_kids',
    duration: { min: 15, max: 30 },
    timeWindow: null,
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'entertainment',
    priority: 5,
    description: 'Dig into the costume box and play dress-up.'
  },
  {
    id: 'organize_bins',
    furnitureId: 'kids_storage_bins',
    label: 'Organize toys / storage',
    room: 'closet_kids',
    duration: { min: 5, max: 10 },
    timeWindow: null,
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Sort toys and supplies into the colorful storage bins.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  GARAGE
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'drive_car',
    furnitureId: 'car',
    label: 'Go for a drive',
    room: 'garage',
    duration: { min: 30, max: 120 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'errand',
    priority: 3,
    description: 'Get in the car and run errands or take a drive.'
  },
  {
    id: 'wash_car',
    furnitureId: 'car',
    label: 'Wash the car',
    room: 'garage',
    duration: { min: 20, max: 40 },
    timeWindow: { start: 8, end: 17 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Get a bucket and sponge and wash the family car.'
  },
  {
    id: 'work_at_bench',
    furnitureId: 'workbench',
    label: 'Work at the bench',
    room: 'garage',
    duration: { min: 15, max: 60 },
    timeWindow: null,
    eligibleRoles: DAD,
    animation: 'use',
    category: 'hobby',
    priority: 4,
    description: 'Tinker on a project at the workbench — fix something, build something.'
  },
  {
    id: 'organize_tools',
    furnitureId: 'tool_shelf',
    label: 'Organize tools',
    room: 'garage',
    duration: { min: 10, max: 20 },
    timeWindow: null,
    eligibleRoles: DAD,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Sort wrenches, screwdrivers, and power tools on the shelf.'
  },
  {
    id: 'ride_bike',
    furnitureId: 'bike',
    label: 'Go for a bike ride',
    room: 'garage',
    duration: { min: 15, max: 45 },
    timeWindow: { start: 7, end: 19 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'exercise',
    priority: 4,
    description: 'Grab the bike from the garage and ride around the neighborhood.'
  },
  {
    id: 'mow_lawn',
    furnitureId: 'lawn_mower',
    label: 'Mow the lawn',
    room: 'garage',
    duration: { min: 30, max: 60 },
    timeWindow: { start: 8, end: 18 },
    eligibleRoles: DAD,
    animation: 'use',
    category: 'chores',
    priority: 4,
    description: 'Fire up the mower and cut the grass. It\'s getting shaggy out there.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  HALLWAY (room-level actions, no specific furniture)
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'walk_through_hallway',
    furnitureId: '_room_hallway',
    label: 'Walk through hallway',
    room: 'hallway',
    duration: { min: 0.5, max: 1 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'walk',
    category: 'transit',
    priority: 1,
    description: 'Just passing through the hallway between rooms.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  BACKYARD — PATIO
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'grill_food',
    furnitureId: 'grill',
    label: 'Grill burgers & dogs',
    room: 'backyard',
    duration: { min: 15, max: 30 },
    timeWindow: { start: 11, end: 20 },
    eligibleRoles: DAD,
    animation: 'use',
    category: 'cooking',
    priority: 5,
    description: 'Fire up the BBQ grill and cook burgers, hot dogs, or steaks.'
  },
  {
    id: 'grill_dinner',
    furnitureId: 'grill',
    label: 'Grill dinner',
    room: 'backyard',
    duration: { min: 20, max: 40 },
    timeWindow: { start: 17, end: 20 },
    eligibleRoles: DAD,
    animation: 'use',
    category: 'cooking',
    priority: 6,
    description: 'Go all out on the grill — ribs, corn, the whole spread.'
  },
  {
    id: 'soak_hot_tub',
    furnitureId: 'hot_tub',
    label: 'Soak in hot tub',
    room: 'backyard',
    duration: { min: 15, max: 45 },
    timeWindow: null,
    eligibleRoles: ADULTS,
    animation: 'sit',
    category: 'relaxing',
    priority: 5,
    description: 'Climb into the jacuzzi and let the jets melt the stress away.'
  },
  {
    id: 'hot_tub_evening',
    furnitureId: 'hot_tub',
    label: 'Evening soak in hot tub',
    room: 'backyard',
    duration: { min: 20, max: 40 },
    timeWindow: { start: 19, end: 23 },
    eligibleRoles: ADULTS,
    animation: 'sit',
    category: 'relaxing',
    priority: 6,
    description: 'Evening wind-down session in the jacuzzi under the stars.'
  },
  {
    id: 'eat_picnic_table',
    furnitureId: 'picnic_table',
    label: 'Eat at picnic table',
    room: 'backyard',
    duration: { min: 10, max: 25 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'eating',
    priority: 4,
    description: 'Enjoy a meal outdoors at the picnic table.'
  },
  {
    id: 'sit_picnic_table',
    furnitureId: 'picnic_table',
    label: 'Hang out at picnic table',
    room: 'backyard',
    duration: { min: 5, max: 20 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'social',
    priority: 3,
    description: 'Sit at the picnic table and chat or enjoy the outdoors.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  BACKYARD — SWIMMING POOL
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'swim_in_pool',
    furnitureId: 'swimming_pool',
    label: 'Go swimming',
    room: 'backyard',
    duration: { min: 15, max: 60 },
    timeWindow: { start: 8, end: 20 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'exercise',
    priority: 7,
    description: 'Jump in the pool and swim some laps or just splash around.'
  },
  {
    id: 'swim_laps',
    furnitureId: 'swimming_pool',
    label: 'Swim laps',
    room: 'backyard',
    duration: { min: 20, max: 45 },
    timeWindow: { start: 6, end: 10 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'exercise',
    priority: 4,
    description: 'Early-morning lap swimming for exercise.'
  },
  {
    id: 'pool_cannonball',
    furnitureId: 'pool_diving_board',
    label: 'Cannonball off diving board',
    room: 'backyard',
    duration: { min: 5, max: 15 },
    timeWindow: { start: 10, end: 19 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'entertainment',
    priority: 6,
    description: 'Run down the diving board and do a huge cannonball splash!'
  },
  {
    id: 'diving_board_dive',
    furnitureId: 'pool_diving_board',
    label: 'Practice dives',
    room: 'backyard',
    duration: { min: 10, max: 30 },
    timeWindow: { start: 10, end: 19 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'exercise',
    priority: 3,
    description: 'Practice belly flops — er, graceful dives — off the board.'
  },
  {
    id: 'lounge_poolside_1',
    furnitureId: 'pool_chair_1',
    label: 'Lounge by the pool',
    room: 'backyard',
    duration: { min: 15, max: 45 },
    timeWindow: { start: 9, end: 18 },
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'relaxing',
    priority: 5,
    description: 'Stretch out on the lounge chair and soak up some sun.'
  },
  {
    id: 'lounge_poolside_2',
    furnitureId: 'pool_chair_2',
    label: 'Sunbathe by the pool',
    room: 'backyard',
    duration: { min: 15, max: 45 },
    timeWindow: { start: 9, end: 18 },
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'relaxing',
    priority: 4,
    description: 'Catch some rays on the second poolside lounge chair.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  BACKYARD — PLAYGROUND
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'play_swings',
    furnitureId: 'swing_set',
    label: 'Swing on the swings',
    room: 'backyard',
    duration: { min: 10, max: 30 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'entertainment',
    priority: 6,
    description: 'Pump those legs and swing high on the swing set!'
  },
  {
    id: 'push_kid_swing',
    furnitureId: 'swing_set',
    label: 'Push kid on swings',
    room: 'backyard',
    duration: { min: 5, max: 15 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'social',
    priority: 4,
    description: 'Stand behind the swing set and push the kids higher!'
  },
  {
    id: 'go_down_slide',
    furnitureId: 'slide',
    label: 'Go down the slide',
    room: 'backyard',
    duration: { min: 5, max: 20 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'entertainment',
    priority: 5,
    description: 'Climb up and slide down — again and again!'
  },
  {
    id: 'play_sandbox',
    furnitureId: 'sandbox',
    label: 'Build sandcastles',
    room: 'backyard',
    duration: { min: 15, max: 40 },
    timeWindow: { start: 7, end: 19 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'entertainment',
    priority: 5,
    description: 'Dig, scoop, and build sandcastles in the sandbox.'
  },
  {
    id: 'monkey_bars_play',
    furnitureId: 'monkey_bars',
    label: 'Climb the monkey bars',
    room: 'backyard',
    duration: { min: 5, max: 20 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'exercise',
    priority: 5,
    description: 'Swing from bar to bar like a little monkey.'
  },
  {
    id: 'jump_trampoline',
    furnitureId: 'trampoline',
    label: 'Jump on trampoline',
    room: 'backyard',
    duration: { min: 10, max: 30 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'exercise',
    priority: 7,
    description: 'Bounce sky-high on the trampoline!'
  },
  {
    id: 'trampoline_adult',
    furnitureId: 'trampoline',
    label: 'Bounce on trampoline',
    room: 'backyard',
    duration: { min: 5, max: 15 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'exercise',
    priority: 2,
    description: 'Adults can bounce too... carefully.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  BACKYARD — SPORTS & PLAY ITEMS
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'kick_soccer_ball',
    furnitureId: 'soccer_ball',
    label: 'Kick soccer ball around',
    room: 'backyard',
    duration: { min: 10, max: 30 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'exercise',
    priority: 4,
    description: 'Dribble and kick the soccer ball around the yard.'
  },
  {
    id: 'shoot_hoops',
    furnitureId: 'basketball',
    label: 'Shoot hoops',
    room: 'backyard',
    duration: { min: 10, max: 30 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'exercise',
    priority: 4,
    description: 'Dribble the basketball and practice shots in the yard.'
  },
  {
    id: 'toss_beach_ball',
    furnitureId: 'beach_ball',
    label: 'Play with beach ball',
    room: 'backyard',
    duration: { min: 5, max: 20 },
    timeWindow: { start: 8, end: 19 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'entertainment',
    priority: 3,
    description: 'Bop the beach ball around in the pool or yard.'
  },
  {
    id: 'jump_rope_play',
    furnitureId: 'jump_rope',
    label: 'Jump rope',
    room: 'backyard',
    duration: { min: 5, max: 15 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: KIDS,
    animation: 'use',
    category: 'exercise',
    priority: 4,
    description: 'Skip and jump rope in the backyard.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  BACKYARD — GARDEN SHED
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'get_garden_tools',
    furnitureId: 'garden_shed',
    label: 'Get garden tools',
    room: 'backyard',
    duration: { min: 2, max: 5 },
    timeWindow: { start: 7, end: 19 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Grab a rake, shovel, or garden hose from the shed.'
  },
  {
    id: 'do_yard_work',
    furnitureId: 'garden_shed',
    label: 'Do yard work',
    room: 'backyard',
    duration: { min: 20, max: 60 },
    timeWindow: { start: 7, end: 18 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 4,
    description: 'Pull weeds, rake leaves, trim hedges — general yard maintenance.'
  },
  {
    id: 'tend_garden',
    furnitureId: 'garden_shed',
    label: 'Tend the garden',
    room: 'backyard',
    duration: { min: 15, max: 40 },
    timeWindow: { start: 7, end: 18 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'hobby',
    priority: 3,
    description: 'Water plants, prune flowers, and check on the garden.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  EXTERIOR — FRONT YARD / PORCH / STREET
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'check_mail',
    furnitureId: '_exterior_mailbox',
    label: 'Check the mailbox',
    room: '_exterior',
    duration: { min: 1, max: 3 },
    timeWindow: { start: 10, end: 17 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'errand',
    priority: 3,
    description: 'Walk out to the mailbox and grab the mail.'
  },
  {
    id: 'water_hedges',
    furnitureId: '_exterior_hedges',
    label: 'Water the hedges',
    room: '_exterior',
    duration: { min: 5, max: 15 },
    timeWindow: { start: 6, end: 10 },
    eligibleRoles: ADULTS,
    animation: 'use',
    category: 'chores',
    priority: 2,
    description: 'Grab a hose and water the front hedges.'
  },
  {
    id: 'sit_on_porch',
    furnitureId: '_exterior_porch',
    label: 'Sit on the porch',
    room: '_exterior',
    duration: { min: 10, max: 30 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'relaxing',
    priority: 3,
    description: 'Step outside and sit on the porch steps.'
  },
  {
    id: 'watch_sunset_porch',
    furnitureId: '_exterior_porch',
    label: 'Watch the sunset',
    room: '_exterior',
    duration: { min: 10, max: 20 },
    timeWindow: { start: 18, end: 21 },
    eligibleRoles: ALL,
    animation: 'sit',
    category: 'relaxing',
    priority: 4,
    description: 'Sit on the porch and watch the sun go down.'
  },
  {
    id: 'wave_at_neighbors',
    furnitureId: '_exterior_porch',
    label: 'Wave at neighbors',
    room: '_exterior',
    duration: { min: 1, max: 3 },
    timeWindow: { start: 7, end: 20 },
    eligibleRoles: ALL,
    animation: 'use',
    category: 'social',
    priority: 2,
    description: 'Stand on the porch and wave hello to a passing neighbor.'
  },

  // ═══════════════════════════════════════════════════════════════════
  //  ROOM-LEVEL ACTIONS (LIGHT SWITCHES, ENTERING/LEAVING)
  // ═══════════════════════════════════════════════════════════════════

  {
    id: 'turn_on_lights',
    furnitureId: '_room_any',
    label: 'Turn on lights',
    room: '_any',
    duration: { min: 0.1, max: 0.2 },
    timeWindow: { start: 17, end: 6 },   // evening / night
    eligibleRoles: ALL,
    animation: 'use',
    category: 'routine',
    priority: 7,
    description: 'Flip the light switch when entering a dark room at night.'
  },
  {
    id: 'turn_off_lights',
    furnitureId: '_room_any',
    label: 'Turn off lights',
    room: '_any',
    duration: { min: 0.1, max: 0.2 },
    timeWindow: { start: 6, end: 17 },   // daytime
    eligibleRoles: ALL,
    animation: 'use',
    category: 'routine',
    priority: 3,
    description: 'Turn off an unnecessary light during the day.'
  },
  {
    id: 'turn_off_lights_leaving',
    furnitureId: '_room_any',
    label: 'Turn off lights (leaving)',
    room: '_any',
    duration: { min: 0.1, max: 0.2 },
    timeWindow: null,
    eligibleRoles: ALL,
    animation: 'use',
    category: 'routine',
    priority: 2,
    description: 'Flip the light switch off when leaving a room.'
  },
];


// ═══════════════════════════════════════════════════════════════════
//  HELPER LOOK-UPS
// ═══════════════════════════════════════════════════════════════════

/** Map from interaction id → interaction object */
export const INTERACTION_MAP = Object.freeze(
  INTERACTION_CATALOG.reduce((map, item) => { map[item.id] = item; return map; }, {})
);

/** Get all interactions that can happen at a given furniture id */
export function getInteractionsForFurniture(furnitureId) {
  return INTERACTION_CATALOG.filter(i => i.furnitureId === furnitureId);
}

/** Get all interactions available in a given room */
export function getInteractionsForRoom(roomId) {
  return INTERACTION_CATALOG.filter(i => i.room === roomId || i.room === '_any');
}

/** Get all interactions a specific role can perform */
export function getInteractionsForRole(role) {
  return INTERACTION_CATALOG.filter(i =>
    i.eligibleRoles === null || i.eligibleRoles.includes(role)
  );
}

/**
 * Filter interactions that are valid right now given the current game hour.
 * Handles time windows that wrap past midnight (e.g. 21→6).
 */
export function filterByTimeWindow(interactions, gameHour) {
  return interactions.filter(i => {
    if (!i.timeWindow) return true;
    const { start, end } = i.timeWindow;
    if (start < end) {
      // Normal window e.g. 8 → 18
      return gameHour >= start && gameHour < end;
    } else {
      // Wraps midnight e.g. 21 → 6
      return gameHour >= start || gameHour < end;
    }
  });
}

/**
 * Pick a random duration (in game minutes) from the interaction's range.
 */
export function rollDuration(interaction) {
  const { min, max } = interaction.duration;
  return min + Math.random() * (max - min);
}

/**
 * Get all unique categories in the catalog.
 */
export function getCategories() {
  return [...new Set(INTERACTION_CATALOG.map(i => i.category))];
}

/**
 * Summary statistics for debugging / display.
 */
export function getCatalogStats() {
  const byRoom = {};
  const byCategory = {};
  for (const i of INTERACTION_CATALOG) {
    byRoom[i.room] = (byRoom[i.room] || 0) + 1;
    byCategory[i.category] = (byCategory[i.category] || 0) + 1;
  }
  return {
    totalInteractions: INTERACTION_CATALOG.length,
    byRoom,
    byCategory
  };
}
