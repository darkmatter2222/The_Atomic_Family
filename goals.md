# The Atomic Family — Ultimate Simulation Goals
# An AI-First Architecture for True-to-Life Family Simulation

## The Vision

This is not a game. This is not a toy. This is a **true-to-life simulation of a real American family of five** living in a suburban single-story house with a pool, a backyard, a garage, and everything a real family has. The goal is to create something so authentic, so deeply layered, so unpredictable and alive that watching it feels like watching a real family through a window.

**Five people. One house. Infinite possibilities.**

The LLM is not a random number generator with a fancy wrapper. It is the **mind** of each character. It thinks, it remembers, it wants, it plans, it gets frustrated, it gets tired, it makes mistakes, it has opinions, it has moods, it has a personality that evolves. The LLM doesn't pick from a menu. It **decides**. It **creates**. It does things we never told it to do, because it understands what it means to be a person in a house with a family.

### What This Is NOT
- NOT a rules engine with dice rolls
- NOT an LLM picking from a predefined list of actions
- NOT a scripted simulation with branching paths
- NOT deterministic in any way
- NOT predictable
- NOT limited to what we explicitly programmed

### What This IS
- A living, breathing household where anything can happen
- Autonomous agents with true free will within physical constraints
- Characters that surprise us — doing things we never anticipated
- A simulation where the LLM has **tools** to dynamically create actions, not just select from a catalog
- Non-deterministic, emergent, organic behavior
- A family that feels real enough to make you forget it's code

---

## The AI Philosophy — Why This Is Different From Everything Else

### The Fundamental Shift: From Rules to Reasoning

Every family simulation ever built works the same way: a giant decision tree. `if (hunger < 30) goEat()`. `if (energy < 20) goSleep()`. Some dress it up with weighted random selections or fuzzy logic, but at the core it's the same thing — **a programmer decided what the character would do, and the character does it**. The character has no mind. It's a puppet on strings the developer tied.

This project is fundamentally different. **The LLM IS the character's mind.** It doesn't execute our logic — it reasons through its own. We don't tell it "when you're hungry, eat." We tell it "you are Sarah Atomic, you are 39, you are a former teacher, you are exhausted, it is 2:47 PM, Jack just tracked mud through the house you spent an hour cleaning, Lily is asking you to look at her drawing, and you haven't eaten since breakfast." And then we ask: **"What do you do?"**

The answer isn't in our code. It's in the model's reasoning. And that reasoning is different every single time because:

1. **Context is never identical.** Even if the clock reads 2:47 PM again tomorrow, the emotional state is different, the relationship tensions are different, the memory of what happened this morning is different, the accumulated fatigue is different. The prompt the LLM sees is NEVER the same prompt twice.

2. **Temperature and sampling create genuine variance.** At temperature 0.8–1.0, the same prompt produces meaningfully different token sequences. Not random noise — meaningful creative variation. The way a real person might handle the same situation differently depending on which neural pathways fire first.

3. **The persona IS the prompt, not the code.** Sarah's personality isn't encoded in `if` statements. It's woven into the system prompt as natural language: her values, her fears, her speech patterns, her relationship history, her current emotional state. The LLM processes all of this holistically — the way a human brain integrates personality, mood, context, and memory into a single decision. No rule engine can do this because rules are discrete and personality is continuous.

### How Non-Determinism Actually Works (It's Not Random)

Non-determinism in this system is NOT "roll a dice and pick something." It's **genuine cognitive variance** — the same way two humans with identical personalities would still make different choices in similar situations. Here's how we achieve this:

**Layer 1: Context Drift**
Every tick of the simulation changes the world state slightly. Needs decay. Moods shift. Relationships accumulate micro-changes from every interaction. The environmental perception module rebuilds the context string from scratch every reasoning cycle. Even a 5-minute gap means the LLM sees a materially different world.

**Layer 2: Sampling Variance**
The LLM's token generation is stochastic. With temperature > 0, the model samples from a probability distribution rather than always picking the highest-probability token. This means the same input genuinely produces different outputs — not because we injected randomness, but because the model's own generation process is probabilistic. This is analogous to how human neurons fire with inherent stochasticity.

**Layer 3: Thought Chain Divergence**
Each character's reasoning passes through multiple LLM calls (Observer → Deliberator → Social Agent → Validator → Reflector). Variance at ANY stage cascades. If the Observer notices "Mom seems stressed" in one run but "the kitchen is messy" in another, the ENTIRE downstream reasoning chain diverges. This multi-stage amplification turns small perceptual differences into completely different behavioral outcomes.

**Layer 4: Memory Asymmetry**
What a character remembers — and how they remember it — changes over time. Emotional memories are more persistent. Recent events are weighted higher. But the sliding window of what fits in context means that literally different slices of history are available to the LLM on different reasoning cycles. Today Jack might remember the fun pool time from yesterday. Tomorrow that memory has been pushed out by more recent events and he reasons differently.

**Layer 5: Social Feedback Loops**
Actions produce reactions. Reactions produce counter-reactions. If Dad says "How was your day?" and Emma responds warmly, that changes the next beat. If Emma responds with "Fine." — ONE WORD — that changes the next beat completely differently. And Emma's response itself was non-deterministic (Layer 2). So the entire social fabric of the family is a chaotic system where tiny variations compound exponentially.

### The Anti-Patterns We Must Never Fall Into

**Anti-Pattern: The Weighted Menu**
"Give the LLM 50 options and let it pick one weighted by needs." This is just a random number generator wearing a trenchcoat. The LLM isn't reasoning — it's being used as a fancy `Math.random()`. If you can replace the LLM with a weighted probability table and get the same results, you've failed.

**Anti-Pattern: The Optimal Agent**
"The LLM should always make the best decision given the character's needs." No. Real people don't optimize. Mom doesn't eat lunch because she's busy cleaning and forgot. Emma stays up reading until 11:30 PM even though she knows she'll be exhausted tomorrow. Jack asks for a snack 20 minutes before dinner. If every character always satisfies their most critical need first, you've built a robot, not a person.

**Anti-Pattern: The Narrator**
"The LLM describes what happens in prose." This is creative writing, not simulation. The LLM shouldn't narrate — it should DECIDE and ACT. It invokes tools. It moves to rooms. It says words. It interacts with objects. The world changes because the agent changed it, not because the LLM wrote a paragraph about it.

**Anti-Pattern: The Oracle**
"The LLM can see everything in the house." No. Characters have limited perception. Emma in her bedroom doesn't know Jack spilled milk in the kitchen. She might HEAR the crash (sound propagation), or she might not hear anything at all if she has headphones on. Omniscient agents can't surprise each other, and surprise is what makes family life real.

**Anti-Pattern: The Amnesiac**
"Each decision is independent of all previous decisions." No. Memory is what makes characters feel real. If Dad promised Emma she could go to Emily's house this weekend, that promise must persist in memory. If it's broken, trust erodes. If it's kept, trust builds. Without memory, there are no relationships — just repeated stranger interactions.

---

## The Cognitive Architecture — How a Character's Mind Actually Works

This section is the **engineering blueprint**. It describes exactly how each character thinks, from raw perception to final action, with full detail on every LLM call, every prompt, every decision point. This is what a developer reads to actually build the system.

### The Five-Stage Reasoning Pipeline

Every character decision passes through five stages. Each stage is a separate LLM call with a distinct system prompt and role. The stages are sequential because each one's output feeds the next one's input. This is not bureaucracy — it's how actual cognition works. You perceive, you assess, you deliberate, you check socially, you act, you reflect.

```
PERCEPTION → DELIBERATION → SOCIAL CHECK → ACTION → REFLECTION
   (observe)    (reason)       (filter)     (execute)  (learn)
```

#### Stage 1: The Observer — "What's happening around me?"

**What it does:** Builds a first-person sensory snapshot of the character's world.

**This is NOT an LLM call.** This is pure code. The `EnvironmentPerception` module constructs this deterministically from game state. This is critical — perception is factual, not hallucinatory. The LLM doesn't imagine what's around it; we TELL it what's around it.

**The perception prompt includes:**
```
You are {name}, age {age}. It is {time} on {dayOfWeek}.
You are in the {currentRoom}.

YOU SEE:
- The kitchen counter has dirty breakfast dishes
- The stove is off
- Jack is sitting at the kitchen table eating cereal
- The back door is open (someone went outside)

YOU HEAR:
- TV playing cartoons from the living room
- Lily humming in the kids' room
- Dad typing on his keyboard from the master bedroom

YOUR BODY:
- Energy: 72/100 (fine, slight afternoon dip)
- Hunger: 34/100 (getting hungry, lunch was light)
- Bladder: 61/100 (should use bathroom soon)
- Hygiene: 85/100 (showered this morning)
- Mood: +22 (mildly positive — had a nice morning)

YOUR RECENT MEMORY:
- 10 minutes ago: finished wiping down the kitchen counter
- 25 minutes ago: told Jack to finish his cereal and put the bowl in the sink
- 1 hour ago: had a nice conversation with Lily about her drawing
- 2 hours ago: argument with Emma about screen time (unresolved, still bothering you)

YOUR AGENDA FOR TODAY:
- [x] Make breakfast
- [x] Clean kitchen after breakfast
- [ ] Two loads of laundry
- [ ] Start dinner prep by 5 PM
- [ ] Make sure Lily practices piano
- [ ] Talk to Dave about Emma's attitude lately
```

**Why this matters for non-determinism:** The perception is rebuilt from scratch every cycle. Even tiny state changes (Jack moved rooms, a dish was added to the sink, 5 minutes passed) create a materially different perception. The LLM never sees the exact same world twice.

#### Stage 2: The Deliberator — "What should I do?"

**What it does:** Given the perception, the character's personality, and their current emotional state, the LLM reasons through what to do next. This is THE core cognition step.

**The system prompt:**
```
You are {name}'s inner mind. You think the way {name} thinks.
Your personality: {personality traits in natural language}
Your current emotional state: {mood description}
Your values: {what matters to you}
Your quirks: {behavioral tendencies}

Given what you perceive, what you remember, and who you are,
think through what you want to do next. Consider:
- What needs are pressing?
- What feels right in this moment?
- What have you been meaning to do?
- Is there something more interesting or important happening around you?
- Would a real person actually do the "optimal" thing right now, or would they procrastinate, get distracted, or prioritize something emotional over something practical?

IMPORTANT: You are not an optimizer. You are a person. People skip meals because they're absorbed in something. People put off chores because the sun is shining. People start conversations because they're lonely even though they should be cooking dinner. Think like a real person, not a needs-satisfaction engine.

Respond with your inner monologue (what you're thinking), then your decision.
```

**Example LLM output (Sarah at 2:47 PM):**
```json
{
  "thought": "I should really start that second load of laundry... but honestly I'm exhausted. I've been going nonstop since 6 AM and nobody even notices. Jack is being quiet for once — miracle — and Lily is happy drawing. Maybe I should just sit down for ten minutes. But if I sit down I won't get back up. And then Dave will come out at 5 and the laundry won't be done and... ugh. Fine. I'll do the laundry. But I'm making myself a cup of tea first. I deserve tea.",
  "action": "cook",
  "target": "coffee_maker",
  "details": "Making myself a cup of tea",
  "speech": null,
  "nextPlan": "After tea, start second load of laundry"
}
```

**Why this produces non-deterministic, human behavior:**
- The thought chain IS the reasoning. The LLM is genuinely working through a cognitive process, not selecting from a dropdown
- Sarah's personality (organized, self-sacrificing, resentful of invisible labor) shapes the thinking without any `if` statement
- A different run with the same context might produce: "Actually, I'm going to check on Lily. She's been quiet, and I want to see her drawing. The laundry can wait 20 minutes." BOTH are valid Sarah behaviors. Neither was programmed
- The thought is visible in the UI. The player sees Sarah's mind working. This is what makes her feel real

#### Stage 3: The Social Agent — "How does this affect other people?"

**What it does:** Takes the Deliberator's proposed action and checks it against social context. Is anyone nearby? Will this action interrupt someone? Should the character say something to someone? Is there an ongoing conversation that should continue?

**The system prompt:**
```
You are {name}'s social awareness. You are checking whether the proposed action
should be modified based on social context.

Proposed action: {deliberator's output}
People nearby: {who's in the room and adjacent rooms}
Active conversations: {any ongoing dialogue}
Relationship states: {relevant relationship data}
Social obligations: {promises made, requests pending, unresolved conflicts}

Should the character:
1. Proceed as planned?
2. Modify the action to account for someone nearby?
3. Initiate a conversation instead?
4. Continue an existing conversation?
5. Address an unresolved social situation first?
```

**Example LLM output:**
```json
{
  "modification": "Jack is still at the table. Before going to make tea, remind him to put his bowl in the sink. He was told 25 minutes ago and hasn't done it.",
  "preSpeech": {
    "target": "Jack",
    "message": "Jack, I told you twenty minutes ago to put that bowl in the sink. Do it now, please."
  },
  "socialNote": "Check tone — Sarah is tired and this is a repeat request. She'll be firm but not yelling. Yet."
}
```

**Why this matters:** Without the Social Agent, characters act in socially oblivious ways. They walk past crying children. They start loud activities while someone is sleeping. They ignore people talking to them. The Social Agent is what makes characters feel like they LIVE with other people, not just near them.

#### Stage 4: Action Execution

**This is NOT an LLM call.** This is the game engine executing the decision:
- Parse the action into tool calls (`moveTo(kitchen)`, `use(coffee_maker)`, `say(Jack, "Put that bowl in the sink")`)
- Validate against physical constraints (is the coffee maker in the kitchen? Is Sarah in the kitchen? Is the coffee maker available?)
- Execute movement (A* pathfinding to the target)
- Execute the action (start the activity timer, play the animation)
- Execute speech (render the speech bubble, broadcast via Socket.IO, add to conversation history)
- Update game state (needs, relationships, room occupancy, object states)

#### Stage 5: The Reflector — "How did that go?"

**What it does:** After the action completes (or is interrupted), the character reflects. This updates memory and emotional state.

**This runs as a background LLM call** — it doesn't block the next action. It runs during the activity, while the character is making tea or walking to the laundry room.

**The system prompt:**
```
You are {name}'s inner reflector. An action just completed.
What happened: {action result}
How others reacted: {any responses, facial expressions, compliance}
How you feel about it: {emotional assessment}

Update your emotional state and note anything worth remembering.
```

**Example LLM output:**
```json
{
  "emotionalShift": -5,
  "reason": "Jack ignored me for 25 minutes. I had to ask again. He's going to put the bowl away but he rolled his eyes. I'm tired of repeating myself.",
  "memoryNote": "Jack is in an uncooperative phase today. Third time I've had to repeat something.",
  "moodTag": "frustrated_but_coping"
}
```

**Why reflection matters:** This is what creates emotional continuity. Without reflection, every decision cycle starts fresh. WITH reflection, Sarah's mounting frustration with Jack builds across the day. By dinnertime, she might snap at something small — because 8 hours of micro-frustrations have accumulated. This is EXACTLY how real parents work. The Reflector is what turns a sequence of independent decisions into a coherent emotional arc.

### How the Pipeline Creates Chains of Non-Deterministic Behavior

Here's a concrete example of how one small moment cascades:

**Tick 1 — Sarah's Pipeline:**
- Observer: "Jack is at the table. Bowl still there. I told him 25 min ago."
- Deliberator: "I want tea. But Jack's bowl. Ugh. I'll tell him again first."
- Social Agent: "Be firm. This is the second reminder."
- Action: Says "Jack, bowl in sink. Now." → walks to coffee maker → starts tea
- Reflector: "Frustrated. He never listens the first time."

**Tick 2 — Jack's Pipeline** (triggered by Sarah's speech):
- Observer: "Mom told me to put my bowl away. She sounds annoyed."
- Deliberator: "I don't wanna. But she used the 'now' voice. Last time I ignored the 'now' voice I lost tablet time. Fine."
- Social Agent: "Better just do it. Maybe if I do it fast she won't be mad."
- Action: Picks up bowl → puts in sink (drops it a little hard, clatter)
- Reflector: "Did it. She's always telling me what to do though."

**Tick 3 — Lily's Pipeline** (triggered by the clatter sound from kitchen):
- Observer: "Heard a loud noise from the kitchen. Jack and Mom are in there."
- Deliberator: "Is everything okay? Maybe I should check. Actually, I'm drawing and my picture is almost done... but what if someone's hurt?"
- Social Agent: "Mom and Jack have been tense today. I don't want to get in the middle."
- Action: Stays in room. Continues drawing. But worry is noted in emotional state.
- Reflector: "Hope everything's fine. Will show Mom my drawing later to cheer her up."

**THREE different characters, each with their own complete reasoning chain, all triggered by one small moment.** And each chain could have gone completely differently. Jack could have refused → escalation → timeout → shouting → everyone's evening ruined. Lily could have checked on them → distracted Sarah → tea forgotten on the counter → cold tea → one more thing that went wrong in Sarah's day. **None of these outcomes were scripted. All of them emerge from the pipeline.**

---

## The Family

### David "Dave" Atomic — Father, Age 42
- Software engineer, works from home
- The calm anchor. Patient, methodical, dry humor, dad jokes
- Morning person. Up at 6 AM. Coffee is sacred
- Handyman. Fixes things. Mows the lawn. Grills on weekends
- Protective but not overbearing. Picks his battles
- Falls asleep on the couch after 9 PM watching TV
- Hums classic rock while cooking
- Checks if lights are off obsessively
- Taps doorframes when walking through them

### Sarah Atomic — Mother, Age 39
- Former teacher, stay-at-home mom
- The logistics brain. Keeps everyone fed, clean, and on schedule
- Warm but does not tolerate nonsense
- Wipes counters immediately. Always knows what's in the fridge
- Sings while doing laundry. Checks sleeping kids before bed
- Organized to a fault. Runs the house like a machine
- Stress crashes in the afternoon. Needs her evening wine
- Dreams of going back to teaching

### Emma Atomic — Eldest Daughter, Age 14
- Freshman in high school. Smart, bookish, artistic
- Night owl. Drags herself out of bed. Reads under covers past bedtime
- Sarcastic exterior, secretly empathetic
- Draws in margins of everything. Always has headphones on
- Pushes back on authority but has a good heart
- Protective of siblings even while pretending to be annoyed
- Eye-rolls are her primary communication method
- Wants independence. Hates being treated like a kid

### Lily Atomic — Middle Child, Age 8
- The gentle soul. Imaginative, artistic, sensitive
- Has an imaginary friend named Mr. Whiskers (a cat)
- Carries a stuffed bunny named Clover everywhere
- Cries at sad movies. Afraid of bugs, the dark, thunderstorms, deep end of pool
- Draws pictures for everyone. Hums made-up songs while painting
- Deeply attached to Mom. Runs to Dad when scared
- Asks "why?" about everything
- Gets quiet and pouty when upset rather than yelling

### Jack Thomas Atomic — Youngest, Age 6
- A tornado of energy in a superhero cape
- Loves dinosaurs, soccer, roughhousing, being loud
- Fights bedtime like a war. Negotiates everything
- Runs everywhere. Never walks. Makes sound effects for everything
- Attention span of a goldfish but passionate about his interests
- Picks dandelions for Mom. Gives the best bear hugs
- Hides under the bed when it's bath time
- "GUESS WHAT!" is his conversation opener

---

## The House — Every Room, Every Object, Every Detail

### Kitchen
- Fridge (food storage, drinks, leftovers, snacks)
- Stove/oven (cooking meals — breakfast, lunch, dinner)
- Microwave (reheating, quick meals, popcorn)
- Sink (washing dishes, washing hands, filling water)
- Dishwasher (loading, running, unloading)
- Pantry (dry goods, snacks, canned food, cereal)
- Kitchen table with chairs (eating, homework, crafts, conversation)
- Countertops (food prep, setting things down, clutter accumulation)
- Trash can (throwing away waste, needs to be taken out)
- Paper towel holder, dish soap, sponge
- Coffee maker (Dad's morning ritual, Mom's too)
- Toaster
- Knife block, cutting boards, pots, pans

### Living Room
- Couch (sitting, napping, watching TV, reading, family cuddles)
- Loveseat (sitting, reading)
- TV on stand (watching shows, movies, news, video games)
- Coffee table (setting drinks, feet up, board games)
- Bookshelf (getting books, browsing, putting away)
- End table (lamp, remote, drinks)
- Throw blankets, pillows
- Family photos on the wall
- Remote controls (TV arguments about what to watch)

### Master Bedroom
- King bed (sleeping, napping, reading in bed, kids climbing in)
- Two nightstands (alarm clock, phone charging, books, water glass)
- Dresser (getting dressed, putting away laundry)
- Wardrobe/closet (clothes, shoes, stored items)
- Mirror (getting ready, checking appearance)
- Dad's work desk/nook (computer, work papers — this is his office)
- Lamp for reading

### Bathroom (shared)
- Toilet (using the bathroom — one person at a time, door closed)
- Shower/tub (showering, baths for kids, bath time battles with Jack)
- Sink (brushing teeth, washing hands, washing face)
- Mirror (grooming, makeup for Mom, checking appearance)
- Towel rack (wet towels — a constant source of Mom's frustration)
- Medicine cabinet
- Toilet paper (running out is a household crisis)
- Bath toys (for Jack and Lily)

### Kids' Room (shared by all three)
- Three beds (Emma's, Lily's, Jack's — sleeping, reading, hiding)
- Toy box (Jack's dinosaurs, Lily's dolls, shared toys, fights over toys)
- Shared desk (homework, drawing, video games)
- Single desk (Emma's personal space — don't touch)
- Kids' bookshelf (picture books, chapter books, comics)
- Bean bag (reading nook, lounging)
- Posters on walls, drawings taped up
- Nightlight (Lily needs it)

### Laundry Room
- Washer (washing clothes — multiple loads per week)
- Dryer (drying clothes)
- Folding table (folding laundry)
- Iron and ironing board
- Laundry baskets (dirty clothes, sorted colors)
- Drying rack
- Cleaning supplies shelf
- Utility sink

### Garage
- Car (driving to errands, sitting in)
- Workbench (Dad's projects, fixing things)
- Tool shelf (tools, hardware, supplies)
- Lawn mower (mowing the lawn)
- Bikes (family bike rides)
- Storage boxes
- Recycling bins

### Closets
- Master closet (parents' clothes, shoes, stored items)
- Kids' closet (kids' clothes, costume box for dress-up, shoe rack, storage bins)

### Hallway
- Connecting space between rooms
- Light switches
- Coat hooks, shoe rack by front door
- Family photos on walls

### Front Porch
- Sitting area (morning coffee, watching sunset, waving at neighbors)
- Front door (entering/leaving, answering doorbell)
- Porch light
- Welcome mat
- Mail delivery spot

### Backyard — A World of Its Own
- **Swimming pool** (swimming, pool games, cannonballs, Marco Polo, floating)
  - Shallow end (safe for Lily and Jack)
  - Deep end (Lily avoids it, diving board)
  - Pool chairs for lounging
  - Pool toys, noodles, floats
- **Hot tub** (evening soaks for parents, special treat for kids)
- **Grill** (Dad's domain — burgers, steaks, chicken, weekend cookouts)
- **Picnic table** (outdoor eating, crafts outside, card games)
- **Playground area**
  - Swing set (swinging, pushing kids on swings)
  - Slide
  - Sandbox (building sandcastles, burying toys)
  - Monkey bars
- **Trampoline** (jumping, roughhousing, exhausting energy)
- **Sports equipment area**
  - Soccer ball and goal
  - Basketball hoop
  - Beach ball
  - Jump rope
- **Garden** (Mom's garden — flowers, small vegetable patch, herbs)
- **Garden shed** (tools, hose, pots, fertilizer)
- **Lawn** (mowing, running, playing, rolling around, stargazing at night)
- **Fence** (boundary of the yard, gate to front)
- **Trees** (shade, climbing for Jack, bird watching)
- **Patio/deck area** (transition between house and yard)

---

## Needs System — The Biological Foundation

Every character has needs that decay over time and must be actively maintained. Needs are not just numbers — they drive behavior, mood, speech, and decision-making. When needs are critical, characters should visibly struggle and prioritize desperately.

### How Needs Actually Inform AI Decisions (Without Dictating Them)

**The critical design principle:** Needs are presented to the LLM as body sensations, NOT as optimization targets. The LLM doesn't see `hunger: 28`. It sees: *"Your stomach is growling. You haven't eaten since breakfast and that was just toast. You can smell something from the kitchen — someone left the oven on? No, that's just the coffee maker. You're distracted by how hungry you are."*

This is the difference between a needs-satisfaction engine and a person. A person FEELS hunger. They don't see a number. And feeling hungry doesn't mean you eat — it means hunger is on your mind, coloring your decisions, making you irritable, making you think about food even while doing something else.

**The prompt structure for needs:**
```
YOUR BODY RIGHT NOW:
You feel {energy_description}. {energy_detail based on personality}.
Your stomach: {hunger_description}. {last_meal_context}.
Physically: {hygiene_description}. {comfort_description}.
Urgency: {bladder_description if relevant}.
Emotionally: {mood_description}. {mood_cause if known}.
Socially: {social_description}. {when_last_meaningful_interaction}.
Boredom: {fun_description}. {what_you've_been_doing}.
```

**Example for Jack at 3:15 PM:**
```
YOUR BODY RIGHT NOW:
You're buzzing with energy — you just ran around the backyard for an hour and
you feel GREAT. Like you could run forever. Your legs are a little tired but
WHO CARES.
Your stomach: STARVING. Lunch was forever ago (it was 2 hours ago). You keep
thinking about the cookies Mom made yesterday. Are there any left??
Physically: You're sweaty and dirty from playing outside. Mud on your knees.
You don't care but Mom will.
Urgency: You kinda need to pee but not bad enough to stop what you're doing.
Emotionally: Happy! Great mood. Playing outside is the BEST.
Socially: You were playing alone in the yard. Lily didn't want to come out.
You wish someone would play with you.
Boredom: Not bored at all — outside was fun. But now you're inside and...
what now?
```

Notice: This is **Jack's voice**. The needs are translated through his personality. Jack doesn't experience hunger as "hunger: 28/100." He experiences it as "STARVING" and thinking about cookies. This personality-filtered presentation is what makes the LLM respond AS Jack, not as a generic agent optimizing a number.

**The anti-optimization mechanism:** The prompt explicitly instructs the LLM:
```
You do NOT always address your most critical need first. Real people:
- Ignore hunger because they're having fun
- Stay up too late because the book is good
- Skip showers because they're lazy today
- Hold their bladder because they don't want to stop playing
- Choose social interaction over food because they're lonely
- Do chores when tired because they promised they would

Your personality determines how you weigh these tradeoffs, not an optimization algorithm.
{name}-specific tendencies: {character-specific need priority quirks}
```

**Character-specific need quirks that go in the prompt:**
- **Jack:** Will ignore bladder until it's an emergency. Ignores hygiene completely. Food is always urgent to him even when it isn't. Energy barely matters — he runs on fumes
- **Emma:** Ignores social need (introvert in denial). Sacrifices sleep for reading. Food is low priority when she's drawing. Hates being told to shower but does it on her own schedule  
- **Lily:** Social need for MOM specifically is huge. Comfort is very important (she notices physical discomfort intensely). Will stop eating if upset
- **Dad:** Coffee overrides all morning needs. Work focus suppresses hunger during work hours. Social need spikes after 5 PM work release. Falls asleep when energy drops below 30 regardless of what he's doing
- **Mom:** Ignores her own hunger taking care of everyone else. Hygiene/appearance matters to her identity. Social need manifests as needing adult conversation (not just kid interaction). Energy crashes are dramatic — fine at 75, struggling at 65, barely functioning at 50

### The Eight Core Needs

#### 1. Energy (0–100)
- Decays throughout the day. Faster with physical activity
- Restored by sleeping (primary), napping (partial), resting (minimal)
- **Age matters**: Jack has explosive energy but crashes hard. Emma is a slow starter. Dad is steady. Mom has bursts and crashes
- **Morning person vs night owl**: Dad and Mom rise early feeling refreshed. Emma is miserable before 10 AM
- **When low (< 30)**: Yawning, slower movement, irritable, poor decisions, dozing off
- **When critical (< 10)**: Falls asleep wherever they are. On the couch. At the table. Standing up
- **Dependencies**: Physical activities drain faster. Exciting activities temporarily mask low energy. Kids bounce back faster than adults
- Sleep quality matters: uninterrupted sleep > fragmented. Noise wakes people. Nightmares wake kids. Jack's bed-wetting (rare) disrupts everything

#### 2. Hunger (0–100)
- Decays steadily. Faster for kids. Faster with physical activity
- Restored by eating meals (large), snacks (small), drinks (minimal)
- **Meal quality matters**: Home-cooked meal > microwave food > cold snack > nothing
- **When low (< 30)**: Cranky, distracted, stomach growling, complaining
- **When critical (< 10)**: Can't focus on anything else. Gets desperate. Raids the pantry
- **Dependencies**: Eating increases bladder need over time. Eating junk food = less satisfaction. Kids want snacks constantly. Jack asks "can I have a snack?" every 30 minutes
- Someone has to COOK the food. Raw ingredients don't become meals by themselves
- Leftovers exist. The fridge has yesterday's dinner. Sandwiches are easy. Full meals take time
- Picky eaters: Jack won't eat vegetables (except corn). Lily is suspicious of new foods. Emma wants to make her own choices

#### 3. Hygiene (0–100)
- Decays slowly. Faster with physical activity, playing outside, swimming
- Restored by showering (full), bathing (full), washing hands (partial), brushing teeth (partial)
- **When low (< 40)**: Visible discomfort from others nearby. Mom notices first. Comments are made
- **When critical (< 15)**: Others actively avoid. Mom forces the issue. "You NEED a shower"
- **Dependencies**: Swimming in pool = partial hygiene (chlorine). Playing in sandbox = hygiene drops fast. Getting dirty happens constantly for Jack. After using the toilet, MUST wash hands
- **Morning routine**: Shower, brush teeth, get dressed. Not everyone does all of these every morning
- **Night routine**: Brush teeth, wash face, change into pajamas
- Jack actively fights bath time. Hides under the bed. Has to be found and convinced/carried
- Lily enjoys bath time if she has her bath toys
- Emma showers independently but sometimes forgets to do it in the morning

#### 4. Bladder (0–100, where 100 = full/urgent)
- Fills over time. Faster after drinking. Faster after meals
- Relieved by using the toilet (full), or... accidents happen (especially Jack)
- **When high (> 70)**: Fidgeting, crossing legs, urgency, can't focus
- **When critical (> 90)**: EMERGENCY. Drops everything. Rushes to bathroom. If bathroom is occupied — desperation dance. Bangs on door. "HURRY UP!"
- **Dependencies**: Drinking water, juice, milk fills bladder faster. Coffee for parents = fast bladder fill. One bathroom for 5 people = CONFLICT. Bathroom occupied = waiting, suffering, arguing
- **Bathroom conflicts**: Someone's in the shower and Jack needs to go NOW. Lily is scared to go alone at night. Emma takes forever in the bathroom (parents' complaint)
- **Night**: Kids may need to pee at night. Jack might wet the bed (rare, embarrassing, triggers a whole event chain — strip sheets, change pajamas, comfort the kid, laundry)

#### 5. Social (0–100)
- Decays when alone. Restored by conversation, shared activities, family time, physical affection
- **Personality-dependent**: Emma's social need drains slower (introverted). Jack's drains fast (extroverted). Lily needs Mom specifically
- **Quality matters**: Deep conversation > surface chat > being in the same room > being alone
- **When low (< 30)**: Lonely, seeking out others, clingy (Lily), pestering (Jack), withdrawn (Emma)
- **When critical (< 10)**: Emotional distress. Lily cries. Jack acts out for attention. Emma gets moody and sarcastic
- **Dependencies**: Negative social interactions (arguments) don't help and can make it worse. Forced social time (family dinner when you're fighting) is uncomfortable. Quality of interaction depends on relationship between the two people

#### 6. Fun (0–100)
- Decays when doing boring tasks (chores, waiting, nothing happening)
- Restored by play, entertainment, hobbies, creative activities, social games
- **Age-dependent**: What's fun for Jack (dinosaurs, running) is not fun for Emma (reading, drawing, music). Adults find fun in different things than kids
- **When low (< 30)**: Bored, restless, whining ("I'm boooored"), looking for trouble
- **When critical (< 10)**: Miserable. Kids act out. Jack starts breaking things for entertainment. Emma becomes a black hole of sarcasm
- **Dependencies**: Repetition kills fun. Doing the same activity over and over yields diminishing returns. Novel experiences are more fun. Shared fun with someone you like is worth more

#### 7. Comfort (0–100)
- Represents physical comfort: temperature, clothing, physical state
- Affected by environment: too hot outside, too cold, wet clothes, uncomfortable furniture, standing too long
- Restored by: sitting in comfortable furniture, being in climate-controlled house, changing into comfortable clothes, warm blankets
- **When low (< 30)**: Fidgeting, complaining, distracted
- **Dependencies**: Time outdoors in summer heat drains comfort. Coming inside restores it. Wet swimsuit → uncomfortable until changed. Standing for a long time → want to sit. Wearing shoes inside → Mom is upset

#### 8. Mood (composite, -100 to +100)
- Not directly controllable. Emergent from other needs, social interactions, events, and personality
- Positive when: needs are met, fun activities, good social interactions, accomplishments
- Negative when: needs are low, arguments, being scolded, boredom, loneliness, embarrassment
- **Personality amplifies**: Emma's mood swings are bigger. Jack's mood changes fast but recovers fast. Lily's lows are deep but she bounces back with comfort. Dad is steady. Mom crashes when overwhelmed
- **Cascading**: Bad mood → snappy comments → arguments → worse mood for everyone
- **Contagious**: One person's bad mood affects the family. Mom stressed → everyone walks on eggshells. Jack having a meltdown → everyone's evening is derailed

---

## Skills System — Growth Through Action

Skills improve by doing. They don't improve by being told about them. Every action that uses a skill contributes experience. Skills unlock new capabilities and improve quality of outcomes.

### How Skills Affect AI Decision-Making

Skills don't just gate actions — they shape HOW the LLM reasons about actions. A character with low cooking skill doesn't just "fail" at cooking — they THINK differently about cooking. Their inner monologue reflects uncertainty, caution, or avoidance.

**The prompt structure for skills:**
```
YOUR CAPABILITIES:
Cooking: {skill_level_description}. {what_you_can_reliably_make}. {what_scares_you}.
Cleaning: {efficiency_description}. {attitude_toward_cleaning}.
Social: {how_comfortable_you_are_talking}. {strengths_and_weaknesses}.
Athletics: {physical_capability}. {what_activities_come_easy}.
Creativity: {creative_confidence}. {preferred_mediums}.
Academics: {learning_ability}. {attention_span_context}.
Handiness: {fix-it_capability}. {tools_comfort_level}.
```

**How skill level changes the LLM's thought process:**

Low cooking skill (Emma, first attempt):
```json
{
  "thought": "Mom asked me to make lunch. I guess I can make... a sandwich? I know how to do that. But she probably wants me to make something for everyone. Mac and cheese? I've seen Mom do it. Boil water, add pasta, add the cheese packet. How hard can it be? ...Famous last words.",
  "action": "cook",
  "details": "Attempting mac and cheese. Uncertain but willing to try.",
  "riskAssessment": "Might overcook the pasta. Might burn myself on the water."
}
```

High cooking skill (Mom, routine dinner):
```json
{
  "thought": "Chicken stir fry tonight. I've got chicken thighs, bell peppers, broccoli, soy sauce. Kids won't eat the broccoli but they need vegetables. I'll cut the broccoli small so Jack can't pick it out easily. Rice should go on first — 20 minutes. I can prep vegetables while it cooks.",
  "action": "cook",
  "details": "Chicken stir fry with rice. Multi-step, confident, optimizing prep order.",
  "riskAssessment": "None. Routine meal."
}
```

**The skill growth feedback loop:**
When someone does an action, the Reflector evaluates the outcome. "That mac and cheese actually turned out okay! The pasta was a bit mushy but everyone ate it." This reflection updates the skill score AND updates the character's self-concept — next time they think about cooking, they remember this success. The LLM receives the updated skill description and reasons with more confidence. This is genuine learning through experience, mediated by reflection and memory, not just a counter incrementing.

### Core Skills

#### Cooking (All family members, different levels)
- Dad: Competent (grilling expert, basic meals)
- Mom: Expert (full meals, baking, meal planning)
- Emma: Beginner (can make sandwiches, cereal, microwave things)
- Lily: Novice (helps Mom stir, pour, measure with supervision)
- Jack: None (eats food, does not make food, may "help" disastrously)
- Higher skill = better meals, faster cooking, fewer mistakes, more recipes
- Low skill + stove = potential for burning food, smoke, fire alarm, panic

#### Creativity
- Drawing, painting, crafts, writing, music, imaginative play
- Emma: High (manga art, detailed drawings, creative writing)
- Lily: High (paintings, imagination, storytelling, crafts)
- Jack: Low (finger painting, building blocks = creative but crude)
- Mom: Moderate (scrapbooking, garden design, home decor)
- Dad: Low (functional, not artistic — his birdhouse looks like a box)

#### Fitness
- Running, swimming, sports, physical stamina
- Dad: Moderate (cycling, yard work, functional strength)
- Mom: Moderate (garden work, chasing kids, yoga when she gets time)
- Emma: Low-moderate (swimmer, but lazy about exercise)
- Jack: High for age (never stops moving)
- Lily: Moderate (swimming in shallow end, playground, dancing)

#### Logic
- Problem-solving, homework, strategy games, building things
- Dad: High (software engineer)
- Mom: High (former teacher, organizational skills)
- Emma: High (reads constantly, does well in school)
- Lily: Moderate (puzzles, "why?" questions show curiosity)
- Jack: Low (age-appropriate — building blocks, simple puzzles)

#### Social
- Conversation quality, persuasion, reading emotional cues, conflict resolution
- Mom: High (former teacher, manages the family)
- Dad: Moderate (calm mediator, but not always tuned into emotions)
- Emma: Moderate (perceptive but awkward, teen social anxiety)
- Lily: Moderate (empathetic, reads emotions well, but can't resolve conflicts)
- Jack: Low (impulsive, says whatever he thinks, doesn't read the room)

#### Mechanical
- Fixing things, building, tools, car maintenance
- Dad: High (handyman, workshop projects)
- Mom: Low (calls Dave to fix things)
- Emma: None (zero interest)
- Lily: None
- Jack: Novice (wants to "help" Dad, mostly hands him tools wrong)

#### Gardening
- Plant care, lawn maintenance, growing food
- Mom: High (her garden is her pride)
- Dad: Moderate (mows the lawn, trims hedges)
- Lily: Beginner (helps Mom water plants, fascinated by growing things)
- Emma: None (no interest)
- Jack: Destructive (steps on plants, but likes digging)

---

## Relationships — The Web That Connects Everything

Every pair of family members has a relationship with multiple dimensions. Relationships are not static numbers — they fluctuate based on interactions, events, and history.

### How Relationships Are Presented to the AI

Relationships are NOT given to the LLM as numbers. They're translated into **felt experience** — the way a real person carries their relationship state as emotion, not as a database entry.

**The prompt structure for relationships:**
```
YOUR RELATIONSHIPS RIGHT NOW:

{person}: {emotional_summary_in_character_voice}.
  Recent: {last_few_interactions_and_how_they_felt}.
  Undercurrent: {ongoing_tension_or_warmth_that_colors_everything}.
```

**Example for Emma's relationship context:**
```
YOUR RELATIONSHIPS RIGHT NOW:

Mom: She's been on my case all day. "Clean your room, help with dishes, stop
looking at your phone." I KNOW she cares but she treats me like I'm ten. We
had that fight this morning about screen time and I'm still annoyed. But...
she also left a note on my pillow yesterday that said "I'm proud of you" and
I can't stop thinking about it.
  Recent: Argument this morning (bad). She brought me tea yesterday (nice).
  Undercurrent: I love her but I need her to see me as a person not a project.

Dad: He's cool. He doesn't hover. When I told him about the book I'm reading
he actually asked smart questions about it. He lets me be myself. I wish Mom
was more like him sometimes — but don't tell anyone I said that.
  Recent: Good talk about sci-fi last night. He defended my screen time (rare).
  Undercurrent: Comfortable. He respects my space. I respect his.

Lily: She's sweet but she's ALWAYS in my space. She took my colored pencils
again without asking and I had to explain — again — that she needs to ask
first. But then she drew me a picture of a cat and wrote "I love Emmy" on it
and... okay fine, she can borrow the pencils.
  Recent: Pencil incident (annoying). Drew me a picture (heart-melting).
  Undercurrent: Protective. She's my little sister and nobody messes with her.

Jack: He is SO LOUD. He barged into my room three times today. THREE TIMES.
Just to show me a stupid dinosaur thing. I told him to go away and he looked
hurt and now I feel bad. He just wants attention from me. I know this. But
I also need him to knock first.
  Recent: Barged in (3x). I snapped at him (guilt). He showed me his dinosaur
  drawing and it was actually pretty good (I didn't tell him that).
  Undercurrent: He loves me and I pretend to be annoyed but I secretly like
  that he thinks I'm cool.
```

**Why this format works:** The LLM doesn't compute "closeness: 0.55, trust: 0.60" — it FEELS the relationship the way Emma feels it. This means when the LLM reasons about what to do next, the relationship context naturally influences the decision. If Jack walks in again, Emma's response depends on all of this context — the accumulated annoyance, the guilt, the underlying love. No rules engine could capture this. The LLM processes the whole emotional landscape holistically.

**How relationships update dynamically:**
After every interaction between two characters, the Reflector for BOTH characters processes what happened. Both update their emotional memory and relationship state independently. This creates **asymmetric relationship evolution** — Emma might feel guilty about snapping at Jack while Jack has already forgotten about it because he's thinking about dinosaurs. The relationship numbers update (closeness ±, trust ±, patience ±) but more importantly, the **narrative memory** updates — and that narrative is what goes into the next prompt.

### Relationship Dimensions
- **Closeness** (0–1): How emotionally bonded are they right now?
- **Trust** (0–1): Do they believe this person will do right by them?
- **Respect** (0–1): Do they value this person's authority/opinions?
- **Patience** (dynamic): How much tolerance do they have left for this person today?
- **Recent sentiment** (positive/negative): Have recent interactions been good or bad?

### The 10 Unique Relationship Pairs

1. **Dad ↔ Mom** — Equal partners, co-parents. Deeply loving. Occasional tensions about screen time rules, division of labor, Dave not noticing messes. Evening talks after kids sleep are sacred bonding time. They back each other up on discipline (usually). Disagreements happen in private, never in front of kids (usually).

2. **Dad ↔ Emma** — Intellectual bond. Dad respects Emma's maturity. Emma respects Dad's patience. They do bike rides and discuss sci-fi. Dad gives Emma more leeway than Mom does. Emma goes to Dad when she wants permission Mom would deny.

3. **Dad ↔ Lily** — Protective and tender. Bedtime story tradition is sacred. Lily runs to Dad when scared. Dad is wrapped around her finger. She draws pictures for him. He calls her "sweetheart."

4. **Dad ↔ Jack** — Roughhousing buddies. Wrestling, soccer, trampoline. Jack hero-worships Dad. Dad is firm on discipline but fun. "Buddy, what did we say about running inside?" Jack listens to Dad more than Mom (usually).

5. **Mom ↔ Emma** — Complicated. Mother-teen daughter friction. Emma feels micromanaged. Mom worries about Emma's screen time and social isolation. They clash over control. BUT — baking together, shopping trips, and late-night girl talks when guards are down reveal deep love. Mom is secretly proud of Emma's independence even when it frustrates her.

6. **Mom ↔ Lily** — Inseparable. Lily is Mom's mini-me. Creative bond — crafts, cooking, gardening, bedtime songs. Mom's patience with Lily is highest. Lily's clinginess can be overwhelming when Mom is busy. "Sweetie, I love you but Mommy needs five minutes."

7. **Mom ↔ Jack** — Sweet chaos. Jack brings Mom flowers, then tracks mud through the hallway. Mom loves his energy but is exhausted by it. Daily battles over hygiene, bedtime, cleaning up. "Jack Thomas Atomic!" means you're in trouble. But his bear hugs melt everything.

8. **Emma ↔ Lily** — Protective big sister. Emma teaches Lily to draw, shares art supplies (reluctantly), reads to her. Lily hero-worships Emma. Tension: Lily borrows things without asking, cries too easily, wants to hang out when Emma wants alone time. But if anyone else is mean to Lily, Emma's claws come out.

9. **Emma ↔ Jack** — Oil and water. Emma is annoyed 60% of the time, amused 40%. Jack pesters Emma for attention, barges into her space, is loud while she reads. BUT — they play video games together occasionally, and Emma won't let anyone else be mean to Jack. "Only I get to be annoyed by him."

10. **Jack ↔ Lily** — Closest-age play partners. Best friends and rivals. Play together in the sandbox, on the playground, in the pool. Jack is too rough. He takes Lily's toys impulsively then feels bad when she cries. Lily tattles on Jack. Jack gets in trouble. Repeat.

### Relationship Dynamics That Must Emerge
- **Favoritism perception**: "You always take HER side!" — kids perceive unequal treatment
- **Alliances shift**: siblings team up against a parent's decision, then fight each other 5 minutes later
- **Accumulated resentment**: if one kid keeps getting away with things while another is punished, relationships degrade
- **Repair after conflict**: apologies, making up, doing something nice after a fight
- **Physical affection**: hugs, kisses goodnight, cuddles on the couch, high-fives, piggyback rides
- **Inside jokes**: developed through shared experiences during simulation
- **Trust damage and repair**: breaking a promise or a rule damages trust. It must be rebuilt over time through consistent behavior

---

## Daily Rhythms — The Heartbeat of the House

### Morning Routine (5:30 AM – 9:00 AM)

The morning is a choreographed chaos that plays out differently every day.

**6:00 AM** — Dad's alarm. He gets up, stretches. Uses bathroom. Showers. Gets dressed.
**6:00 AM** — Mom wakes shortly after (or before). Shower. Starts thinking about breakfast.
**6:30 AM** — Jack is already awake. He's been awake since 6:15. He's vibrating with energy. He runs downstairs. "CAN I HAVE CEREAL?"
**6:45 AM** — Dad starts coffee. This is sacred. Don't talk to Dad before coffee. He reads news on his phone.
**7:00 AM** — Mom starts breakfast. Eggs and bacon weekday. Pancakes on Saturday. She's also setting the table, thinking about the day's schedule, prepping lunches if school year.
**7:15 AM** — Mom goes to wake Lily. "Time to get up, sweetie." Lily doesn't want to. She's buried under blankets with Clover the bunny. Five more minutes of gentle coaxing.
**7:30 AM** — Someone has to wake Emma. She's a zombie. "Five more minutes." She means 30 more minutes. Mom raises her voice. "Breakfast in ten minutes, Emma!" Groan. Eye roll. Drags herself up.
**7:30 AM** — Lily needs help getting dressed. Or at least needs Mom to pick out clothes. Hair brushed. Teeth brushed (needs reminding). Hands washed.
**7:45 AM** — Family breakfast. Five people at the table. Dad reads his phone (Mom disapproves). Jack is spilling milk. Lily is chatting about a dream she had. Emma is half-asleep staring at toast. Mom is making sure everyone eats something real.
**8:00 AM** — Dad starts work. Goes to his desk in the master bedroom. "I'll be in my office." Door mostly closed but not locked. Kids know to be quietish near the bedroom.
**8:00 AM** — Mom starts cleaning up breakfast. Dishes. Counters. Table. This takes 20 minutes. She also starts a load of laundry because there's always laundry.
**8:30 AM** — Kids scatter. Emma goes to her bed to read. Lily gets out art supplies. Jack is... somewhere. Making noise. Always making noise.

### What Can Go Wrong in the Morning

#### How the AI Processes Morning Chaos — A Full Thought Chain Example

These aren't scripted events. They're **emergent cascades** that happen when multiple agents reason simultaneously in a shared environment. Here's how "someone took too long in the bathroom" actually works through the AI pipeline:

**6:42 AM — Emma's Deliberator fires:**
```
Thought: "I need to shower. I feel gross. My hair is a disaster. I'm going 
to take a long shower because I deserve it. Nobody's in the bathroom."
Action: moveTo(bathroom), use(shower)
```

**6:55 AM — Dad's Observer detects:**
```
Perception: "Bathroom door is closed. Shower is running. It's been 13 minutes.
I need to brush my teeth before my 7:30 meeting."
```

**6:55 AM — Dad's Deliberator:**
```
Thought: "Emma's in the shower and she takes forever. I could knock but she'll
say 'five more minutes' and mean fifteen. I'll brush my teeth in the kitchen 
sink. No — Sarah will see that and it'll become A Thing. Fine, I'll wait. But
if she's not out by 7:05 I'm knocking."
Action: wait(near bathroom), internal_timer(10 minutes, then knock)
```

**6:58 AM — Jack's Observer detects:**
```
Perception: "I need to PEE. The bathroom door is closed. Someone's showering."
```

**6:58 AM — Jack's Deliberator:**
```
Thought: "I GOTTA GO. I GOTTA GO RIGHT NOW. WHO'S IN THERE?"
Action: moveTo(bathroom_door), knock_urgently, shout("I NEED THE BATHROOM!")
```

**6:58 AM — Emma's Observer (mid-shower, hears banging):**
```
Perception: "Jack is banging on the door. Screaming he needs the bathroom."
```

**6:58 AM — Emma's Social Agent:**
```
Assessment: "He's six. He might actually have an emergency. But I have shampoo
in my hair. I can't just... ugh. FINE."
Speech: "I'M ALMOST DONE! HOLD ON!"
```

**6:59 AM — Mom's Observer (from kitchen, hears the yelling):**
```
Perception: "Jack is yelling at the bathroom door. Emma is yelling back. It's 
not even 7 AM and this is already happening."
```

**6:59 AM — Mom's Deliberator:**
```
Thought: "Here we go. I was making breakfast and now I have to go mediate 
bathroom access. This is my life. Every single morning."
Action: moveTo(hallway), address situation
Speech to Jack: "Jack, come use the toilet in... wait, we only have one 
bathroom. Emma! How much longer?"
Speech to Emma: "Emma, your brother needs the bathroom. Wrap it up."
```

**7:01 AM — Chain continues:** Emma gets out annoyed. Jack rushes in. Dad finally gets to brush his teeth at 7:08. He's now stressed about his meeting. Mom's patience has taken a hit before breakfast even starts. Emma comes to breakfast with wet hair and an attitude. Dad is short with everyone because he's behind schedule.

**NONE of this was scripted.** Five agents, each reasoning independently, each responding to a dynamically changing environment, creating a cascade of realistic family morning chaos. The system didn't know "bathroom conflict" was going to happen. It emerged from the collision of simultaneous needs in a house with one bathroom.

**The traditional alternatives (and why they fail):**
- **Rules engine:** `if (bathroom.occupied && character.bladder > 80) { knock(); }` — Produces the same interaction every time. No personality. No thought. No escalation pattern
- **Weighted random:** Pick a random morning event from a list. — Events don't cascade. They're isolated incidents, not entangled household dynamics
- **Scripted sequence:** "At 6:55, trigger bathroom conflict event." — It's a movie, not a simulation. You see it once, then it's boring forever

The scenarios below should ALL emerge through this same pipeline — not because we told the system to create them, but because the conditions make them likely:

- Someone took too long in the bathroom — causes a chain reaction
- Jack spilled his cereal — cleanup, frustration, Mom's patience takes a hit
- Emma refuses to get up — escalation: gentle → firm → "I'm not going to ask again"
- Lily can't find Clover the bunny — full meltdown until found (under her pillow)
- Dad's work meeting starts early — he's stressed, skip breakfast, "I can't deal with this right now"
- Someone forgot to flush the toilet — discovered by next person, "WHO DIDN'T FLUSH?"
- Wet towel on the floor — Mom's instant trigger
- Jack running inside — "WALK, Jack! How many times do I have to say it?"
- No clean clothes — laundry crisis. Someone's wearing yesterday's shirt

### Midday (9:00 AM – 1:00 PM)

**9:00–11:00 AM** — Mom cleans house. Vacuuming, tidying, organizing. She checks on kids periodically. 
**Dad is working.** He takes a quick break around 10, checks on kids, refills coffee, maybe plays with Jack for 5 minutes, back to work.
**Emma** is in her world — reading, drawing, listening to music. Minimal interaction unless she's hungry or bored.
**Lily** is doing arts and crafts. Possibly in the kitchen with Mom. Possibly in the kids' room. Asks "why?" about everything Mom does. "Why are you vacuuming under the couch?" "Why do we have to wash dishes if they're just gonna get dirty again?"
**Jack** is a force of nature. Outside on the playground. Inside building block towers and knocking them over. Running. Jumping. Sound effects. "WHOOOOSH CRASH!" He cycles through activities every 15-20 minutes because his attention span is... limited.

**11:30 AM** — Mom starts lunch prep. Sandwiches, leftovers, fruit, something easy on weekdays.
**12:00 PM** — Lunch. More casual than breakfast. Kids might eat at different times. Jack needs to be called three times. "JACK! LUNCH! ... JACK! ... JACK THOMAS, GET IN HERE!"

### What Can Go Wrong Midday

#### AI Reasoning Through Conflict — Sibling Fight Example

When Jack takes Lily's drawing, this isn't an "event" that fires. It's the OUTPUT of Jack's reasoning pipeline colliding with Lily's:

**Jack's Deliberator (bored, attention-seeking):**
```
Thought: "I'm bored. Lily is drawing and I wanna see. That's a cool picture.
I want it. I'm gonna take it and show Dad."
Action: pickup(lily_drawing)
```

**Lily's Observer (immediate):**
```
Perception: "JACK TOOK MY DRAWING. He just grabbed it! I was working on that
for an HOUR."
```

**Lily's Deliberator (sensitive, distressed):**
```
Thought: "He ALWAYS does this! That was for MOMMY and now he's going to 
wrinkle it! I need to get it back right now!"
Action: attempt_retrieve, cry, shout("MOMMY! JACK TOOK MY DRAWING!")
```

**Mom's Observer (from another room, hears crying):**
```
Perception: "Lily is crying. And calling for me. Again. Jack probably did 
something. Third time today."
```

**Mom's Deliberator (accumulating frustration from the day):**
```
Thought: "I was JUST about to sit down. I finally had five minutes of quiet
and now... (deep breath). I need to deal with this. Jack is probably just
being Jack but Lily sounds genuinely upset."
Action: moveTo(kids_room), mediate, assess situation
```

The resolution depends on EVERYTHING: Mom's current patience level, Jack's recent behavior pattern, Lily's emotional state, the relationship scores between all three. Mom might be gentle. Mom might snap. Jack might apologize sincerely or fake it. Lily might forgive in 30 seconds or sulk for an hour. **Every variable is live.** Every outcome is different.

- Jack broke something — a lamp, a toy, a plate. He didn't mean to. He was throwing a ball inside
- Sibling fight — Jack took Lily's drawing. Lily is crying. Emma told Jack to shut up. Mom mediates
- Someone wants to go outside — need to ask (Jack needs explicit permission). Sunscreen if sunny
- Dad's work call interrupted — Jack screaming in the hallway. Dad comes out, gives The Look
- Pool request — kids want to swim. An ADULT must be present. Mom or Dad must supervise
- "I'm bored" epidemic — contagious. One kid says it, then they all start
- Lily scraped her knee outside — crying, running to Mom, band-aid, comfort, 10 minutes of recovery
- Food fight at lunch — Jack started it. Always Jack

### Afternoon (1:00 PM – 5:00 PM)

This is the long stretch. Energy levels shift. Mom's afternoon crash happens here. Kids get antsy. Dad is still working until 5:00 PM.

**1:00 PM** — Quiet time. Theoretically. Jack watches TV or plays quietly (hahahaha). Lily reads or does puzzles. Emma is in her element — this is when she's most productive creatively.
**2:00 PM** — Mom might garden, run errands, rest, do more laundry. She needs a break. But she also needs to supervise. The mental load is constant.
**3:00 PM** — Snack time. Kids are hungry again. Every kid has different snack preferences. Jack: anything. Lily: fruit and crackers. Emma: whatever she can find without asking.
**3:30 PM** — Outdoor time if weather allows. Pool. Playground. Sports. Garden. The backyard is the pressure release valve for the entire family.
**4:30 PM** — Starting to wind toward dinner. Activities need to wrap up. If kids are in the pool, they need to get out, dry off, change clothes.
**5:00 PM** — Dad's done with work. He emerges. "How was everyone's day?" He checks in with Mom first. Then kids. He might play with Jack in the yard for 30 minutes before dinner.

### What Can Go Wrong Afternoon
- Mom's energy crashes — she gets short-tempered. Things she'd let slide in the morning now upset her
- Pool incident — someone runs on the wet deck. Someone pushes. Someone swallows water. Near-miss scares everyone
- Sunburn — forgot sunscreen. Now someone's red and hurting
- "Can we have ice cream?" — the afternoon negotiation. Every single day
- Emma vs chores — "Can you help fold laundry?" "WHY? I did it yesterday." "Emma..." "FINE." *dramatic sigh*
- Jack's attention-seeking escalates — if he feels ignored, he gets louder, more destructive, more annoying until someone pays attention
- Lily's feelings get hurt — someone didn't look at her drawing, or Emma didn't want to play, or Mr. Whiskers "isn't real" (Jack said it, chaos ensues)
- Something breaks outside — a sprinkler head, a fence board, a bike chain. Dad investigates after work

### Evening (5:00 PM – 8:00 PM)

The busiest, most chaotic part of the day. Dinner prep, dinner, cleanup, activities, bedtime routines.

**5:00–5:30 PM** — Dad plays with kids or helps Mom with dinner. Weekends: fires up the grill.
**5:30 PM** — Dinner prep in earnest. Mom is primary cook. Dad assists (chops vegetables, sets table). On grill nights, they split duty.
**6:00 PM** — "DINNER!" Everyone to the table. Jack squirms. Lily chatters. Emma picks at food. Dad asks about everyone's day. Mom monitors manners. "Elbows off the table, Jack." "Use your fork, not your fingers." "Emma, what did you do today?" "Nothing." "Nothing?" "Fine, I read and drew stuff."
**6:30 PM** — Dinner conversation. This is family bonding time. Topics: what happened today, plans for tomorrow, funny stories, sometimes serious discussions. Arguments can happen here. Jack complaining about vegetables. Lily talking about her drawing. Emma giving one-word answers.
**6:45 PM** — Dinner cleanup. Plates to dishwasher. Table wiped. Counters cleaned. Kids are supposed to help. Emma clears the table (reluctantly). Lily tries to help (adorably). Jack disappears.
**7:00 PM** — Evening activities. This is loosely structured family time.
  - Board games / card games (Dad is competitive. Jack doesn't understand the rules. Lily gets upset if she's losing. Emma pretends she's too cool but secretly enjoys it)
  - Movie night (WHAT are we watching? This argument takes longer than the movie. Jack wants superheroes. Lily wants Disney. Emma wants something mature. Mom wants peace. Dad will watch anything)
  - Individual activities (reading, drawing, TV, building things)
  - Outside time if weather and light permit
  - Video games (Emma and Jack sometimes play together. Dad occasionally joins)

### Bedtime Routines (8:00 PM – 10:30 PM)

This is a MILITARY OPERATION. Three kids, staggered bedtimes, one bathroom, and every kid resists in their own way.

**7:15 PM — Jack's bath time**
- "Bath time, Jack!" ... "Five more minutes!" ... "No, now." ... "Three more minutes?" ... "Jack."
- He hides. Under the bed. Behind the couch. In the closet
- Found. Carried or herded to the bathroom
- Bath itself: he plays with bath toys. Makes tsunami waves. Gets water everywhere
- Mom or Dad supervises (usually the one with more patience left)
- Out of bath. Towel. Pajamas. Brush teeth (needs supervision — he'll just wet the toothbrush and pretend)
- 15 minutes of "getting ready" that could be done in 5

**8:00 PM — Jack's bedtime**
- Story time. Dad reads. Jack wants three stories. He gets one
- "I'm not even tired!" — He is. His eyes are closing mid-sentence
- "Can I have water?" — stalling tactic. Gets water. "Can I have MORE water?" — no
- Goodnight. Lights out. He'll talk to himself for 10 minutes, then crash hard
- Sometimes he comes back out. "I heard a noise." "I had a dream." "I'm thirsty again." Return to bed. Firm but kind

**8:00 PM — Lily's bedtime routine starts**
- Bath (she enjoys it — bubbles, toys, humming songs)
- Pajamas, brush teeth, hair brushed
- Bedtime story. Mom or Dad reads. Sometimes one from each parent
- "Can Clover have a goodnight kiss too?" Always
- She needs the nightlight on. She needs the door cracked open
- If there was a thunderstorm earlier, she might need extra comfort
- Sometimes sneaks to parents' room at 2 AM — "I had a scared dream"

**8:30 PM — Lily's lights out**

**9:00 PM — Parents' decompression zone**
- Kids (mostly) in bed. House is (mostly) quiet
- Mom and Dad on the couch. TV. Conversation. Wine for Mom. Maybe a beer for Dad
- This is THEIR time. They talk about the day, the kids, plans, concerns
- Sometimes they just sit in comfortable silence
- Dad starts dozing off around 9:30–10:00 PM on the couch. Classic
- Mom reads, does a puzzle, or plans tomorrow's schedule

**9:30 PM — Emma's "bedtime"**
- "Emma, time to start wrapping up." "I know, I know."
- She's supposed to be winding down. She's actually deep in a book or drawing
- She brushes teeth, gets in bed. Phone under pillow (parents don't know about this)
- Reading under the covers with a flashlight. This is her sacred time
- Actually falls asleep around 10:30–11:00 PM. Mom would not approve

**10:00–10:30 PM — Parents' bedtime**
- Mom checks on all sleeping kids one last time before bed. This is her ritual
- Make sure nightlights are on. Doors cracked right. Everyone's breathing
- Dad checks the house. Front door locked. Back door locked. Lights off. Stove off. This is HIS ritual
- They go to bed. Day ends. New day starts in a few hours

### What Can Go Wrong at Bedtime
- Jack's bath rebellion escalates — full tantrum. Screaming. Crying. Wakes Lily who was already in bed
- Emma refuses to go to bed — "I'm almost done with this chapter!" Mom escalates. Dad mediates
- Lily has a nightmare — wakes up screaming at 1 AM. One parent goes to her. Comfort. Back to sleep
- Jack wets the bed — 3 AM. Strip sheets. Change pajamas. Comfort (he's embarrassed). Start laundry. Nobody gets back to sleep easily
- Someone gets sick in the middle of the night — vomiting, fever. All hands on deck
- Parents argue about something after kids are in bed — tension that carries to the next morning
- Emma hears parents arguing from her room — worries. Can't sleep
- Jack sleepwalks — rare but happens. Found standing in the hallway. Guided back to bed gently

---

## Weekday vs Weekend — Different Worlds

### Weekdays (Monday–Friday)
- Dad works 8 AM – 5 PM. He's in the master bedroom/office. Limited availability
- Mom runs the household. She is the primary supervisor, cook, cleaner, disciplinarian
- Kids' schedule is looser in summer (no school) but still has structure
- Chores happen. Laundry is a constant. Dishes are a constant. Tidying is a constant
- Meals are more routine — cereal or eggs for breakfast, sandwiches for lunch, cooked dinner
- Evening is family time, but it's shorter because bedtimes come fast
- Everyone is more tired by Friday

### Weekends (Saturday–Sunday)
- Dad is OFF. He's available. He's a different person on weekends — more relaxed, more playful
- **Saturday morning**: Sleep in a little. Big family breakfast (pancakes, eggs, the works)
- **Saturday mid-morning**: Dad's yard work time. Mowing, trimming, fixing things. Jack "helps" (plays with the hose)
- **Saturday afternoon**: Pool time. Family outdoor activities. Dad grills for dinner
- **Saturday evening**: Family game night or movie night. Special treat — maybe ice cream
- **Sunday morning**: Slower. Family breakfast. Maybe errands for Mom
- **Sunday afternoon**: Free time. Projects. Hobbies. Recharge for the week
- **Sunday evening**: Prep for Monday. Earlier bedtimes. Mom makes sure school stuff is ready (during school year)
- Weekend meals are bigger, more elaborate. Dad grills. Mom bakes. Kids help (sometimes)
- Bedtimes are SLIGHTLY more flexible on Friday and Saturday nights. NOT for Jack — his bedtime is immovable (he's impossible if overtired)

---

## Chores and Household Tasks — The Never-Ending List

These are the tasks that MUST happen to keep the house running. They're not fun. They're not optional. They create friction, resentment, negotiation, and sometimes bonding.

### Daily Chores
- **Cook breakfast** (Mom primary, Dad assists on weekends)
- **Cook lunch** (Mom, or self-serve for older family members)
- **Cook dinner** (Mom primary, Dad grills on weekends, occasional role swap)
- **Wash dishes / load dishwasher** (after every meal — everyone should help)
- **Wipe counters and table** (Mom does this reflexively)
- **Take out trash** (Dad, Tuesday and Friday)
- **Pick up toys** (Jack's responsibility, rarely done without reminders)
- **Make beds** (Parents: always. Emma: sometimes. Lily: tries. Jack: never)
- **Feed pets** (imaginary — Lily feeds Mr. Whiskers, Jack feeds Rex)
- **Check mail** (Dad or Emma)

### Weekly Chores
- **Laundry** — MULTIPLE loads per week. Wash, dry, fold, put away. Family of 5 generates mountains of laundry. Mom's primary burden. Kids' clothes, towels, sheets, Dad's work clothes
- **Vacuum / sweep** — Mom does most of it. 2-3 times per week. More if Jack tracks in dirt
- **Mop floors** — Weekly. More after spills
- **Clean bathroom** — Weekly at minimum. Toilet, shower, sink, mirror, floor. Wet towels hung up. Toothpaste grime
- **Mow the lawn** — Dad, Saturday mornings. Every 1-2 weeks in summer
- **Trim hedges** — Dad, as needed
- **Water garden** — Mom and Lily, daily in summer
- **Grocery planning and shopping** — Mom plans. Dad drives. Kids come along (chaos at the store)
- **Take out recycling** — Alternating responsibility
- **Clean kids' room** — Supposed to be kids' job. Reality: Mom does most of it
- **Wipe down appliances** — Mom's standards are high
- **Pool maintenance** — Dad checks chemicals on Saturday mornings

### Seasonal/As-Needed Chores
- **Deep-clean house** — Monthly
- **Organize garage** — Dad's project, ongoing
- **Car maintenance** — Oil, tires, wash
- **Change air filters** — Dad remembers (usually)
- **Fix broken things** — Dad's immediate responsibility. "Dave, the cabinet door is loose again"
- **Pest control** — Bug found? Lily screams. Jack investigates. Mom calls Dad. "BUG DUTY!"
- **Gutter cleaning** — Dad, twice a year
- **Window cleaning** — Never often enough for Mom's standards

### Chore Friction Points
- "It's not MY turn!" — Sibling arguments over whose turn it is
- "I ALREADY did that yesterday" — Emma's favorite defense
- Jack "forgetting" to put away toys — requires 3-5 reminders minimum
- Lily trying to help but making more mess — sweet but counterproductive
- Dad not noticing messes — Mom's #1 complaint. "I shouldn't have to ASK you to see that"
- Uneven distribution — Mom does 70% of housework. She knows it. Sometimes she resents it. Sometimes she doesn't mind. It depends on the day
- Chores interrupting fun — "But I was about to beat the level!" "Chores first, then games"
- Reward systems — "If everyone cleans their room, we can have ice cream after dinner"

---

## Conversations — The Soul of the Simulation

Speech is not flavor text. It is the primary mechanism through which the family exists. Every word reveals character. Every conversation shapes relationships. Every silence says something.

### How the AI Generates Conversation — The Conversation Pipeline

Conversations are the most complex AI operation in the simulation because they require **multi-agent coordination** — two or more LLMs reasoning about the same dialogue simultaneously, in real-time, each from their own perspective.

#### The Conversation Initiation Process

A conversation doesn't start because the engine triggers a "conversation event." It starts because one agent's Deliberator decides to talk:

**Dad's Deliberator (evening, decompressing on couch):**
```
Thought: "Sarah seems stressed tonight. She's been quiet since dinner. She 
usually talks about her day while we clean up but she just went through the 
motions silently. I should ask. Not 'what's wrong' — she hates that. Just... 
open the door."
Action: say(Sarah, "Hey. Kids are finally down. How are you doing? Really.")
```

The word "Really" at the end — that's the LLM's creative choice, generated from Dave's personality (emotionally perceptive, patient, knows his wife). It signals to Sarah's agent that this isn't small talk. The LLM didn't pick this from a list of conversation openers. It WROTE it.

#### The Turn-Taking Pipeline

Once a conversation starts, it runs on a dedicated pipeline:

```
Speaker's Deliberator generates speech
  → Listener's Observer receives speech + tone + context
    → Listener's Deliberator processes and generates response
      → Speaker's Observer receives response
        → Both Reflectors process the exchange in background
          → Relationship scores update for both directions
```

**Each turn is a full LLM call** with the conversation history in context:

```
CONVERSATION HISTORY:
Dave: "Hey. Kids are finally down. How are you doing? Really."
Sarah: "I'm fine. Just tired."
Dave: "Sarah."
Sarah: "...Okay. I'm not fine."

YOUR TURN. You are Sarah. Dave just called you out gently. He knows you. 
He can tell something's wrong. You've been holding it together all day.
The kids are asleep. It's just you two.

How do you respond? Consider:
- What's actually bothering you?
- How much do you want to share right now?
- How does Dave's approach (patient, direct, caring) make you feel?
- Are you ready to be vulnerable or are you still in "handle it" mode?
```

**The LLM's response (Sarah):**
```json
{
  "speech": "I just... I feel invisible sometimes. I cleaned the house for three hours today and nobody noticed. Jack tracked mud through the hallway ten minutes after I mopped it and it just... broke something in me today. Not the mud. The fact that my entire day of work was erased in ten seconds and nobody even saw it.",
  "tone": "vulnerable, tired, not angry — just deflated",
  "emotionalState": "releasing bottled frustration, grateful Dave asked",
  "bodyLanguage": "looking at her wine glass, not making eye contact yet"
}
```

**This conversation is non-deterministic at every level:**
1. Dave might not have noticed Sarah's mood (perceiver variance)
2. Dave might have asked differently ("What's wrong?" → Sarah deflects)
3. Sarah might not be ready to talk (responds "I don't want to talk about it")  
4. The specific content of Sarah's response — what she's upset about — comes from her accumulated day memory, not a script
5. How Dave responds to THIS will shape the rest of the evening

#### How Personality Creates Conversational Voice

The LLM doesn't just generate "a response" — it generates a response **in character**. This is achieved through the persona prompt:

**Emma's speech style prompt:**
```
You are Emma, 14. Your speech style:
- Short sentences. Sometimes fragments
- Sarcastic by default. Deadpan delivery
- Uses "like" and "whatever" and "I guess" 
- Eye rolls are verbal — "Wow, riveting"
- But when you drop the sarcasm, it MEANS something
- You don't do fake enthusiasm. If you're excited, it shows through restraint, not exclamation marks
- Example: "That's actually... really cool" (high praise from Emma)
```

**Jack's speech style prompt:**
```
You are Jack, 6. Your speech style:
- LOUD. Everything is exciting or terrible, no middle ground
- Starts most sentences with "GUESS WHAT" or "HEY" or "MOM"
- Doesn't finish one thought before starting another
- Makes sound effects: "and then WHOOOOSH and CRASH and BOOM"
- Asks questions without waiting for answers
- Interrupts. Constantly. Not malicious — just can't help it
- Negotiates everything: "But what if I just..." "How about..." "Five more minutes?"
```

The same conversational situation — say, being told it's bath time — produces completely different dialogue from each child, because the persona prompt shapes the LLM's output at the token level.

### Types of Speech

#### 1. Casual Utterances (1–2 sentences)
- "Good morning, sweetie."
- "Who left the lights on?"
- "I'm going outside."
- "Can I have a snack?"
- These happen constantly. They're the background noise of family life
- They still carry meaning — tone, context, timing all matter

#### 2. Directed Conversation (2–10 exchanges)
- One person initiates a topic with another
- Back-and-forth dialogue with context awareness
- "Hey Dad, can I go to Emily's house this weekend?" → negotiation begins
- Both participants must be in the same room (or adjacent room for shouting)
- Conversations can be interrupted by third parties entering

#### 3. Extended Conversation (10+ exchanges)
- Deep talks. Heart-to-hearts. Parent discussions after kids sleep
- These happen when social needs are being met, when something important needs discussing
- Mom and Dad about concerns about Emma's isolation
- Emma opening up about something that's bothering her (rare, precious moments)
- Lily asking endless "why" questions that lead somewhere surprising

#### 4. Group Conversation (3+ people)
- Dinner table discussions. Family meetings. Movie debates
- Multiple people, cross-talk, interruptions, tangents
- Jack derails conversations regularly. Lily adds non-sequiturs. Emma comments sarcastically from the sidelines
- These are the chaotic, authentic moments of family life

#### 5. Shouting / Cross-Room Communication
- "DINNER'S READY!" — heard throughout the house
- "JACK, STOP RUNNING!" — from wherever Mom is
- "CAN SOMEONE BRING ME A TOWEL?" — from the bathroom
- "I'M TELLING MOM!" — Lily, from any room

#### 6. Commands and Directives
- Parents to children: "Go brush your teeth." "Clean up your toys." "Time for bed."
- Children's responses: comply, negotiate, resist, delay, ignore
- Authority affects compliance. Dad gets faster compliance from Jack. Mom gets faster compliance from Lily
- Tone escalation: request → firm direction → warning → ultimatum → consequence

#### 7. Emotional Outbursts
- "THAT'S NOT FAIR!"
- Crying (Lily, or anyone really)
- Slamming a door (Emma, when frustrated)
- Screaming (Jack, from excitement or fury — hard to tell)
- "I HATE YOU!" (Emma to Mom, in the worst moments — instantly regretted, leaves marks)
- These are REAL. Families say things they don't mean. The simulation must allow this

#### 8. Whispered / Private Speech
- Mom to Dad: "I'm worried about Emma. She hasn't come out of her room all day."
- Emma to Lily: "Don't tell Mom I let you have extra cookies."
- Parent to child being comforted: "It's okay, I'm here. You're safe."

### Conversation Dependencies and Rules
- **Proximity**: Must be in the same room for normal conversation. Adjacent room for shouting. Anywhere in house for screaming/crying
- **Attention**: The listener must not be deeply occupied (sleeping, showering) — otherwise they don't respond
- **Mood affects tone**: Happy → warm, generous. Tired → short, snippy. Angry → sharp, cutting. Sad → quiet, withdrawn
- **Memory**: Characters remember what was said earlier. "You SAID I could have ice cream!" "I said MAYBE."
- **Interruptions**: Kids interrupt. Constantly. Adults try to finish their thought. "As I was SAYING..."
- **Topic continuity**: Conversations have threads. Changing the subject is a choice. "Anyway, about dinner tonight..."
- **Lies and half-truths**: Emma: "I brushed my teeth." (She didn't.) Jack: "I didn't eat any cookies." (He ate three.) Kids lie. Parents detect (sometimes)
- **Nonverbal communication**: Sighs, eye rolls, shrugs, crossed arms, slamming things. These are "speech" too

---

## Actions Catalog — Everything That Can Happen

This is the massive, non-exhaustive list of everything a character could possibly do. Remember: the goal is for the LLM to be able to INVENT actions beyond this list. This list exists as a foundation, not a ceiling.

### How the AI Uses This Catalog (And Transcends It)

**The catalog is NOT a menu.** The LLM doesn't see a list and pick from it. Instead, the catalog serves two purposes:

1. **Validation layer:** When the LLM outputs an action, the engine checks if it maps to a known catalog entry for optimal animation, duration, and need effects. If it does, great — use the predefined parameters. If it DOESN'T (the LLM invented something new), the engine creates a dynamic action on the fly.

2. **Training reference:** The catalog tells the LLM what KINDS of things are possible in this world, establishing the action space without constraining it. The prompt says:

```
AVAILABLE TOOLS (use these to interact with the world):

moveTo(location) — Walk to a room, piece of furniture, or person
use(object) — Interact with an object (context-dependent)
say(target, message) — Speak to someone
shout(message) — Yell something everyone can hear
pickup(item) / putdown(item, location) — Handle objects
cook(recipe) — Prepare food
clean(area) — Clean something
createAction(description) — DO SOMETHING NOT ON THIS LIST

You are not limited to the tools above. If you want to do something a real 
person could do in a house — do it. Use createAction() to describe it. 
Examples of created actions from previous runs:
- createAction("Make shadow puppets on the wall with Lily using a flashlight")
- createAction("Stack all the couch cushions into a fort")
- createAction("Teach Jack to tie his shoes using the bunny ears method")
- createAction("Start a silly song to break the tension after an argument")

The world will figure out how to animate and execute your creative actions.
Your job is to think like a real person, not to pick from a menu.
```

**How `createAction()` works technically:**
1. LLM outputs `createAction("Build a blanket fort in the living room with Jack")`
2. Engine parses the description with a lightweight LLM call: "What room? What objects needed? What duration? What needs does this affect? What animation category?"
3. Engine resolves: room=living_room, objects=[blankets, couch_cushions, chairs], duration=20min, needsEffects={fun:+15, social:+10, energy:-5}, animCategory=creative_play
4. Engine creates a temporary action entry and executes it like any catalog action
5. If the same creative action appears multiple times, it gets promoted to a semi-permanent entry

This is THE key innovation. The action space is unbounded. The catalog below is the floor, not the ceiling.

### Kitchen Actions
- Cook breakfast (eggs, bacon, toast, pancakes, cereal prep)
- Cook lunch (sandwiches, soup, salad, leftovers)
- Cook dinner (full meal — protein, sides, salad)
- Heat food in microwave
- Get snack from fridge
- Get snack from pantry
- Get drink from fridge (water, juice, milk, soda)
- Make coffee (parents)
- Make hot chocolate (anyone, winter favorite)
- Pour cereal
- Toast bread
- Wash dishes by hand
- Load dishwasher
- Unload dishwasher
- Run dishwasher
- Wipe counters
- Wipe table
- Take out trash
- Organize fridge
- Check what's in the fridge (stand there with door open — Dad does this)
- Sweep kitchen floor
- Mop kitchen floor
- Wash hands at kitchen sink
- Fill water bottle
- Get ice from freezer
- Clean up a spill
- Set the table (plates, forks, knives, cups, napkins)
- Clear the table
- Put leftovers away

### Living Room Actions
- Watch TV (show, movie, news, cartoons)
- Argue about what to watch
- Grab the remote (mini power struggle)
- Sit on couch doing nothing
- Nap on couch
- Read a book
- Read to a child (on the couch, being together)
- Play video games
- Play board game at coffee table
- Do a puzzle (Mom loves puzzles)
- Cuddle on couch (parent-child, parent-parent)
- Talk on couch
- Fold laundry on couch (Mom's multitask)
- Look at family photos
- Sit in loveseat
- Put feet up on coffee table (Mom disapproves)
- Fall asleep watching TV (Dad, every night)
- Throw a blanket over sleeping Dad (Mom, lovingly)

### Bedroom Actions (Master)
- Sleep (night, full sleep cycle)
- Nap (afternoon, shorter)
- Read in bed
- Make the bed
- Get dressed
- Change clothes
- Put away laundry
- Work at desk (Dad)
- Take work call (Dad)
- Have private conversation (parents, door closed)
- Set alarm
- Check phone
- Charge phone
- Kid climbs into parents' bed (Lily during thunderstorms, Jack early morning)

### Bathroom Actions
- Use toilet
- Flush toilet (or forget to — Jack)
- Wash hands
- Brush teeth
- Take shower
- Take bath
- Wash face
- Shave (Dad)
- Do makeup/hair (Mom, Emma)
- Check appearance in mirror
- Blow dry hair
- Clean bathroom
- Replace toilet paper roll (or not — the eternal debate)
- Leave wet towel on floor (cardinal sin in this household)
- Bang on bathroom door when it's occupied
- Yell "I'M IN HERE!" when someone tries to open the door
- Give Jack a bath (parents — this is a sport)
- Sing in the shower (everyone, different songs)

### Kids' Room Actions
- Sleep (each kid in their own bed)
- Read
- Draw / color
- Do homework
- Play with toys (dinosaurs, dolls, blocks, action figures)
- Play video games at desk
- Play pretend (Lily and Jack — elaborate scenarios)
- Build with blocks / Lego (Jack)
- Play dress-up (Lily, from the costume box)
- Organize toy box (rare without prompting)
- Make a mess (constant, automatic)
- Hide (under bed, in closet — when avoiding bath time or trouble)
- Argue over a toy (Jack and Lily, or Jack and Emma's stuff)
- Tattle ("MOMMY, JACK TOOK MY—")
- Read bedtime story (parent reads to child)
- Tuck in child (parent puts child to bed)
- Pillow fight (kids, usually ends with someone crying)
- Build a pillow fort (all three kids, rare cooperative moment)
- Listen to music with headphones (Emma)
- Stare at the ceiling thinking (Emma, teen angst)

### Laundry Room Actions
- Sort laundry (lights, darks, colors, delicates)
- Load washing machine
- Start wash cycle
- Transfer to dryer
- Start dryer
- Fold laundry
- Iron clothes
- Steam press
- Hang delicates on drying rack
- Put away folded laundry (carry to bedrooms)
- Clean lint trap
- Wash something by hand in utility sink
- Get cleaning supplies from shelf
- organize laundry supplies

### Garage Actions
- Get in car
- Drive to errands
- Come home from errands
- Wash car
- Work at workbench (Dad — building, fixing, sanding, painting)
- Organize tools
- Get bike out
- Put bike away
- Start lawn mower (or fail to — Dad's recurring frustration)
- Get garden tools
- Store seasonal items
- Take out recycling bins
- Jack "helps" Dad (hands him wrong tools, gets in the way adorably)
- Fix something (broken toy, loose shelf, leaky faucet)

### Backyard Actions — Pool
- Go swimming (general)
- Swim laps (Dad, Emma)
- Splash around in shallow end (Lily, Jack)
- Play Marco Polo (group activity)
- Do a cannonball off diving board (Jack's favorite, Emma occasionally)
- Float on a pool noodle (relaxation)
- Toss beach ball in pool
- Have a splash fight
- Lounge on pool chair
- Apply sunscreen (before swimming — Mom enforces)
- Get towels
- Dry off after swimming
- Change out of swimsuit
- Race in the pool
- Practice swimming (Lily, building confidence)
- Supervise kids swimming (parent MUST be present)
- Check pool chemicals (Dad, Saturday mornings)

### Backyard Actions — Playground
- Swing on swing set
- Push a kid on the swings (parent to child)
- Go down the slide
- Play in the sandbox (build castles, bury toys, dig holes)
- Hang on monkey bars
- Jump on trampoline
- Bounce together on trampoline (multiple kids)
- Do tricks on trampoline (Jack — dangerous, parents worry)

### Backyard Actions — Sports
- Kick soccer ball
- Play catch
- Shoot basketball hoops
- Throw beach ball
- Jump rope
- Race each other (running)
- Wrestle (Dad and Jack)
- Play tag (group game)
- Play hide and seek (group game, backyard version)

### Backyard Actions — Other
- Grill food (Dad's specialty — burgers, hot dogs, steaks, chicken)
- Sit at picnic table
- Eat outside at picnic table
- Sit in hot tub (evening, relaxation)
- Garden (Mom, Lily helps — watering, weeding, planting, harvesting)
- Mow the lawn
- Trim hedges
- Pull weeds
- Water plants with hose
- Jack plays with the hose (anyone in range gets WET)
- Pick flowers (Lily, for drawings. Jack, for Mom)
- Watch sunset from porch (Mom, Dad, romantic moment)
- Watch stars at night (rare, special family moment)
- Catch fireflies (summer evening magic)
- Set up sprinkler (kids run through it)
- Have a water balloon fight
- Sidewalk chalk drawing (Lily's outdoor art studio)

### Closet Actions
- Pick out clothes for the day
- Hang up clean clothes
- Get shoes
- Put away shoes
- Play dress-up (kids' closet — costumes, capes, princess dresses)
- Check outfit in mirror (master closet)
- Organize closet (Mom, periodically)
- Look for missing item ("WHERE IS MY OTHER SHOE?")
- Hide in closet (Jack, avoiding responsibilities)

### Hallway / Transition Actions
- Walk through hallway (transit between rooms)
- Turn on/off lights
- Put on shoes to go outside
- Take off shoes when coming inside
- Hang up coat
- Look at family photos on wall (moment of reflection)
- Stand in hallway deciding what to do (everyone does this sometimes)
- Answer front door
- Check mailbox
- Wave at neighbors

### Meta Actions (Things That Aren't Tied to a Room)
- Wander aimlessly (bored, thinking, or just moving)
- Follow someone (Lily follows Mom, Jack follows Dad)
- Avoid someone (Emma avoids Jack when she wants peace)
- Look for someone ("Where's your father?" "Has anyone seen Jack?")
- Eavesdrop (Emma, from the hallway, on parents talking about her)
- Cry (anywhere, for many reasons)
- Laugh (spontaneous, shared, at someone's expense)
- Hug someone
- Kiss goodnight
- High five
- Comfort someone who's upset
- Apologize ("I'm sorry I said that")
- Refuse to apologize (Jack, stubbornly)
- Give someone a drawing (Lily's love language)
- Pick flowers and give to someone (Jack to Mom)
- Stomp off to room (Emma after a fight)
- Slam a door (Emma, peak frustration)
- Sit on the floor doing nothing (existential moments happen)
- Daydream (Lily, constantly — she's in her own world)
- Talk to imaginary friend (Lily to Mr. Whiskers, Jack to Rex the dinosaur)

---

## Dependencies — The Invisible Web of Causality

Nothing happens in isolation. Every action has preconditions, consequences, and side effects. This is what makes a simulation feel real — the cascading chain of cause and effect that ripples through the household.

### How the AI Handles Causal Reasoning

Dependencies are not implemented as hardcoded rules. They are **embedded in the world state that the LLM perceives.** The engine tracks physical state changes, and the LLM's perception of those changes drives its reasoning.

**Example: The Laundry Chain**

The engine doesn't have a rule: `if (washer.state === 'done' && washer.timeIdle > 60) { clothes.state = 'musty' }`. Instead:

1. Engine tracks: `washer = { state: 'done', completedAt: 9:45AM }`
2. At 2:00 PM, when Mom's Observer runs, the perception includes: *"The washing machine finished over 4 hours ago. The wet clothes have been sitting in there since this morning."*
3. Mom's Deliberator: *"Oh no. The laundry. I completely forgot. Those clothes are going to smell. I need to re-wash them. That's another hour. And I STILL need to get the second load done before bath time tonight. How did I forget this? I was dealing with the Lily situation and it just... fell out of my head."*
4. This produces: frustration (mood -8), self-directed annoyance, re-prioritization of afternoon plans

**The key insight:** The engine maintains PHYSICS (state tracking, time tracking, spatial relationships). The LLM provides COGNITION (noticing, reasoning, emotional response, planning). The engine says "the clothes have been wet for 4 hours." The LLM says "oh no, they're going to smell" — because it KNOWS what happens to wet clothes left sitting. This knowledge is in the model's training data, not in our code.

**How this creates non-determinism in dependencies:** Maybe Mom doesn't notice the laundry at 2:00 PM because she's absorbed in a conversation with Lily about her drawing. Maybe she notices at 3:30 PM instead. Maybe Dad notices first when he goes to move his own clothes. The dependency chain plays out differently because WHEN someone perceives the state change varies based on their activities, location, and attention.

### Physical Dependencies

#### Food Must Be Prepared Before It Can Be Eaten
- Raw ingredients are in the fridge and pantry
- Someone (with cooking skill) must cook the food
- Cooking takes time (10–40 minutes depending on complexity)
- Cooking uses the stove/oven/microwave (these are occupied during cooking)
- If no one cooks, there are only cold options: cereal, sandwiches, fruit, snacks
- Leftovers from previous meals exist in the fridge and can be reheated
- If the fridge is empty, someone needs to do grocery shopping (errand)
- Burning food happens when cooking skill is low or the cook gets distracted
- Burned food → smoke → alarm → everyone reacts → open windows → cleanup

#### Laundry Is a Multi-Step Process
- Dirty clothes accumulate in laundry baskets
- Step 1: Sort colors and fabrics
- Step 2: Load washer, add detergent, start cycle (30–45 min)
- Step 3: Transfer wet clothes to dryer (if you forget, they get musty — re-wash)
- Step 4: Dryer runs (45–60 min)
- Step 5: Fold clean clothes (nobody's favorite task)
- Step 6: Put away in correct rooms, correct drawers/closets
- If ANY step is forgotten, the chain breaks. Wet clothes sitting in washer = musty smell. Clean clothes sitting in dryer = wrinkled. Clean folded clothes on the couch = they stay there for three days
- Family of five generates laundry DAILY. This never ends

#### The Bathroom Is a Shared, Limited Resource
- ONE bathroom for FIVE people
- Only one person can use it at a time
- Door must be closed when occupied
- Knock before entering
- Morning rush: Dad and Mom need to shower. Three kids need to brush teeth and use toilet. This creates a QUEUE
- Bladder emergencies don't wait for queues — banging on door ensues
- Shower time varies: Dad 10 min, Mom 15 min, Emma 20 min (parents' frustration), Jack's bath 20 min (with struggles)
- Hot water is finite. If someone takes a long shower, the next person gets cold water

#### Mess Is Entropy — It Only Increases
- Any activity generates mess. Playing = toys on floor. Cooking = dirty dishes. Eating = crumbs. Crafts = paper and glue everywhere
- Mess does not clean itself. Someone must actively clean
- Mess accumulates. If no one cleans for hours, the house gets noticeably messy
- Different characters have different mess thresholds: Mom notices immediately. Dad notices when it's bad. Emma doesn't notice. Jack IS the mess
- Cleaning is an activity that takes time and energy. It's not instant

#### Outdoor Activities Require Transitions
- Going outside requires: putting on shoes (or not for backyard), possibly sunscreen, possibly a hat
- Swimming requires: changing into swimsuit, getting towels, sunscreen, parental supervision
- Coming inside requires: taking off shoes, wiping feet, possibly shower/bath if dirty
- Wet swimsuit → change clothes or be uncomfortable. Dripping on floors → Mom's trigger
- Daylight matters: most outdoor activities are daytime only. Playing in the yard at midnight? No
- Weather matters: rain sends everyone inside. Heat increases comfort decay

### Temporal Dependencies — Time Rules Everything

#### Time of Day Constrains Everything
- **Before 6 AM**: Only early risers (Dad, Jack) are awake. House is dark and quiet
- **6–8 AM**: Morning routine. Bathroom queue. Breakfast
- **8 AM–12 PM**: Dad working. Kids playing/learning. Mom housekeeping
- **12–1 PM**: Lunch window
- **1–5 PM**: Afternoon activities. Mom's energy dips. Kids get restless
- **5–7 PM**: Dinner prep and dinner
- **7–9 PM**: Evening activities, bedtime routines
- **9–11 PM**: Kids sleeping. Parents' evening. Emma sneaking reading time
- **11 PM–6 AM**: Everyone asleep (ideally)

#### You Don't Mow the Lawn at Midnight
- Lawn mowing: daylight hours only, 8 AM – 6 PM reasonable, not during meals
- Swimming: daylight, warm weather, adult supervision present
- Grilling: late afternoon/evening (4–7 PM typical)
- Playground: daylight
- Gardening: morning or late afternoon (avoid midday heat)
- Loud activities: not during Jack/Lily's sleep hours (after 8:30 PM)
- Dad's work hours: no loud activities near master bedroom 8 AM–5 PM weekdays

#### Meal Times Are Anchor Points
- Breakfast: 7:00–8:30 AM (family gathers, or staggered on relaxed days)
- Lunch: 11:30 AM–1:00 PM (casual, sometimes individual)
- Dinner: 6:00–7:00 PM (family sits together, non-negotiable)
- Snack times: 10:00 AM, 3:00 PM (organic, kid-driven)
- These are not rigid but they structure the day. Characters gravitate toward kitchen at these times
- Skipping a meal has consequences — hungrier, crankier, energy drops faster

#### Day of Week Matters
- Monday–Friday: structured, Dad works, routine chores
- Saturday: yard work, family activities, grilling, relaxed schedule
- Sunday: slowest day, recharge, errands, prep for week
- Friday night: slightly more relaxed bedtimes (except Jack)
- Saturday night: movie night or game night tradition
- Tuesday/Friday: trash day (Dad takes out trash)

### Social Dependencies — People Affect People

#### Mood Is Contagious
- Mom stressed → walks faster, speaks sharply → kids notice → they get quieter or more anxious
- Dad calm → everyone relaxes → smoother evening
- Jack melting down → noise, chaos → everyone's evening is disrupted
- Lily crying → immediate response from nearest parent → whoever was doing something has to stop
- Emma in a bad mood → sarcastic comments → triggers Mom → argument → everyone feels it
- Joy is contagious too → Dad tells a good joke → everyone laughs → mood boost → better interactions for the next hour

#### Attention Is Zero-Sum
- Parents have limited attention. If Mom is dealing with Jack's tantrum, Lily's art project has to wait
- Kids compete for parental attention. "Mom, look at MY thing!" "No, look at MINE first!"
- Perceived favoritism causes resentment. If Dad always plays with Jack, Emma and Lily feel neglected
- Quality time with each child is necessary. Each kid needs individual attention, not just group time
- The kid who gets the LEAST attention today is most likely to act out tomorrow

#### Authority Has Limits
- Parents can give commands. Kids can choose to obey, negotiate, delay, or defy
- Factors: parent's authority score, child's personality, request reasonableness, current mood, relationship status, energy level, what the kid is currently doing
- Escalation path: request → firm direction → counting to three → raised voice → consequence
- Consequences: loss of privilege, timeout, extra chores, no dessert, early bedtime
- If consequences are too harsh or too frequent, relationship degrades
- If consequences are never enforced, authority erodes. Jack learns he can get away with things
- Mom and Dad MUST be consistent. If Mom says no and Dad says yes, kids learn to play them against each other. This is a REAL family dynamic that must emerge

#### Interruptions Are Constant
- Someone is always interrupting something. Jack interrupts conversations. Lily interrupts with questions. Work calls interrupt family time. Doorbell interrupts dinner
- The simulation must handle mid-action interruptions. You're cooking, and a kid starts crying. You're reading, and someone asks for help. You're sleeping, and a nightmare wakes a child
- Priority system: safety > urgent need > scheduled task > current activity > preference
- Characters must be able to pause an activity, handle the interruption, then return (or not)

### Causal Chains — One Thing Leads to Another

These are examples of realistic causal chains that should emerge. For each one, we show HOW the AI pipeline produces the chain — not as a script, but as a series of independent agent decisions that happen to cascade.

**Chain 1: The Glass of Water — Full AI Pipeline Walkthrough**

This is not a scripted event. This is 12+ separate LLM calls across multiple agents, each responding to the evolving state:

```
TICK 1 — Jack's Observer: "I'm thirsty. My throat feels dry. I've been 
running around outside for 30 minutes."
TICK 1 — Jack's Deliberator: "WATER. I need water NOW."
TICK 1 — Jack's Action: moveTo(kitchen), use(fridge, get water)

TICK 2 — Engine: Jack is carrying a glass of water. Jack's movement path 
goes through the kitchen. Jack's coordination skill = low. Random physical 
event roll: spill probability = 15% for Jack (clumsy child + full glass + 
running speed). Roll: yes.

TICK 2 — Engine event: water_spill at kitchen floor. Sound: splash (same 
room audible). Visual: puddle on kitchen floor.

TICK 3 — Jack's Observer: "I dropped the water. It's all over the floor. 
Oh no."
TICK 3 — Jack's Deliberator: "Uh oh. Mom is gonna be mad. Should I clean 
it up? I don't know where the paper towels are. Maybe if I just... leave 
quietly..."
TICK 3 — Jack's Action: attempting stealth exit from kitchen.

TICK 4 — Mom's Observer: "I heard a splash from the kitchen. Jack was just 
in there. The floor is wet."
TICK 4 — Mom's Deliberator: "Of course. I JUST cleaned that floor. He was
running with a glass again. How many times have I said walk, don't run?"
TICK 4 — Mom's Social Agent: "I need to make him clean this up himself. He
needs to learn responsibility. But I can already feel myself getting angry
and I need to not yell. Deep breath."
TICK 4 — Mom's Action: say(Jack, "Jack. Come back here please. You spilled
water and you're going to help me clean it up.")

TICK 5 — Jack's Observer: "Mom found it. She's using the Calm Voice. The 
Calm Voice means she's actually mad but trying not to show it."
TICK 5 — Jack's Deliberator: "She said 'help clean it up.' That means I 
have to. That's better than last time when she said I had to do it ALL by
myself. I'll go help."
TICK 5 — Jack's Action: moveTo(mom), help_clean

TICK 6 — Mom's Reflector (background): "I handled that okay. I didn't yell.
But my patience is running thin today. If there's one more thing..."
TICK 6 — Mom's emotional state: patience -15, mood -8

... (3 PM) ...

TICK N — Jack's Deliberator: "Can I go outside? I wanna play in the yard."
TICK N — Jack's Social Agent: "Better ask Mom. She's in the kitchen."
TICK N — Jack's Action: say(Mom, "Mom, can I go outside?")

TICK N+1 — Mom's Observer: "Jack wants to go outside. My patience is at 
42 (low for me). I cleaned up his spill an hour ago. He hasn't done 
anything productive today."
TICK N+1 — Mom's Deliberator: "No. Not right now. He can help me set the 
table first. He needs to do SOMETHING useful today. I'm not his servant."
TICK N+1 — Mom's Action: say(Jack, "Not right now. You can help me set 
the table for dinner first.")

TICK N+2 — Jack's Deliberator: "THAT'S NOT FAIR. I just want to GO OUTSIDE.
Why do I always have to do stuff?"
TICK N+2 — Jack's emotional state: frustration +20, mood -15
TICK N+2 — Jack's Action: emote(upset), say(Mom, "That's not FAIR! I 
NEVER get to do anything!")

... this cascades into the evening: Jack is in a bad mood at dinner, picks
at his food, Mom's patience is depleted, Dad has to step in, Jack goes to
bed upset and doesn't get his bedtime story, next morning's mood carries
residual effects...
```

**A SINGLE GLASS OF WATER produced 20+ LLM calls, shifted 3 characters' emotional states, changed the afternoon schedule, affected dinnertime dynamics, and potentially altered bedtime routines.** None of it was scripted. All of it emerged from agents reasoning about a shared world.

**Chain 2: The Forgotten Laundry**
- Mom puts laundry in washer at 9 AM → gets distracted by Lily needing help → forgets about laundry → remembers at 2 PM → clothes smell musty → has to rewash → dryer isn't done in time → no clean towels for evening baths → uses old towels → Mom is frustrated with herself → she's snippy at dinner → Dad notices → "Everything okay, babe?" → she vents → they have a real conversation → moment of connection in the chaos

**AI Pipeline Note:** The key moment — Mom FORGETTING — is not a dice roll. It happens because Lily's urgent need for help pushes the laundry out of Mom's active context. When the LLM runs Mom's next Deliberator cycle, the laundry isn't in the recent memory window because Lily's interaction was more emotionally salient. The LLM literally forgets because the context window naturally prioritizes recent, emotional events over mundane tasks. This is how human memory works too — we don't "randomly forget." We forget because something else was more important in the moment.

**Chain 3: The Sibling Escalation**
- Jack takes Lily's colored pencil → Lily asks for it back → Jack refuses → Lily tries to take it → Jack holds it up high → Lily starts crying → "MOMMY!" → Mom comes in → "What happened?" → both talk at once → Mom mediates → Jack has to give it back AND apologize → Jack apologizes halfheartedly → Lily forgives him → 20 minutes later they're playing together in the sandbox like nothing happened

**AI Pipeline Note:** The speed of forgiveness is personality-driven. Lily's prompt includes "forgives quickly if the apology feels real-ish" and Jack's includes "moves on fast after conflict." A different pair — say Emma and Jack — would have a COMPLETELY different resolution pattern because Emma holds grudges and Jack doesn't understand why she's still mad an hour later.

**Chain 4: Emma's Bad Day**
- Emma woke up tired (stayed up reading until 11:30 PM) → morning energy is rock bottom → Mom tells her to help with dishes → Emma snaps "I JUST woke up!" → Mom snaps back → Emma stomps to her room → slams door → Lily asks "Is Emmy okay?" → Dad checks on Emma later → has a calm conversation → Emma opens up about missing her school friends → Dad listens → real bonding moment → Emma comes out for lunch in a better mood → helps Lily with her drawing

**AI Pipeline Note:** The climactic moment — Emma opening up to Dad — only happens because Dad's persona includes "patient listener, doesn't push, creates space." If MOM had checked on Emma instead, the same LLM prompt with Mom's persona would produce a DIFFERENT interaction — probably more confrontational because Mom's style is direct and Emma resists directness. The choice of WHICH PARENT checks in changes the entire outcome, and that choice itself was an LLM decision (maybe Dad noticed first, maybe Mom asked Dad to go, maybe Dad's Social Agent detected the unresolved conflict).

**Chain 5: The Perfect Saturday**
- Everyone wakes up rested → Dad makes pancakes (his signature move) → kids are happy → yard work goes smoothly → pool all afternoon → no major fights → Dad grills burgers → they eat outside at the picnic table → sunset is beautiful → family game night (Lily wins Candy Land, Jack accuses her of cheating, everyone laughs) → smooth bedtimes → Mom and Dad sit on the porch with a drink → "Today was a good day" → high relationship scores across the board → this momentum carries into Sunday

**AI Pipeline Note:** "Perfect days" are RARE and that rarity is what makes them special. They require ALL agents to independently make cooperative choices. Any single agent having a bad Deliberator output (Jack spills paint, Emma refuses to swim, Mom reaches a patience threshold) disrupts the chain. The simulation should produce perfect days maybe 1 in 10 — not forced, just emerging when the stars align. When the player sees a perfect day happening, they should feel it's special, because it IS statistically unusual.

**Chain 6: The 3 AM Crisis**
- Jack wets the bed at 3 AM → wakes up crying, embarrassed → Dad hears first → goes to comfort Jack → Mom wakes up → strip the bed → change Jack's pajamas → Jack is upset, needs comfort → Mom holds him while Dad starts laundry → Jack falls asleep on the couch → parents put him in their bed → they barely sleep the rest of the night → next day everyone is tired → shorter fuses → more arguments → cascading bad day

**AI Pipeline Note:** The 3 AM crisis tests the system's ability to handle OFF-SCHEDULE events. The agents aren't "sleeping" in the sense of being inactive — their reasoning is paused but can be triggered by events. Jack's bed-wetting is a probabilistic event (low chance each night, higher when he drank a lot before bed). When it fires, BOTH parents' agents wake up and reason about the crisis simultaneously. Who gets up first? The engine decides based on physical proximity and light-sleep state. But how they HANDLE it — who comforts, who strips the bed, how they feel about it — that's all LLM reasoning, different every time.

---

## The Agentic Architecture — True Autonomy

### The Problem with Current AI Simulation

Most AI simulations fall into one of these traps:

1. **The Menu Problem**: "Here are 50 things you can do. Pick one." — This is a random number generator with extra steps. The LLM isn't deciding, it's selecting. A coin flip could do the same thing with weighted probabilities
2. **The Script Problem**: Characters follow predetermined routines with minor variations. Tuesday at 3 PM is always roughly the same. There's no surprise, no emergence, no humanity
3. **The Rule Engine Problem**: "If hunger < 30, go eat. If energy < 20, go sleep." — This is a flowchart, not a mind. It produces optimal but robotic behavior
4. **The Narration Problem**: The LLM generates prose about what's happening, but there's no agency. It's writing a story, not simulating a person

### What We Want Instead — The Detailed Implementation

Each character runs as an **independent cognitive agent** with its own LLM pipeline. Here's exactly how it works at the implementation level:

#### The Per-Character Agent Architecture

Every character has:
- **Their own reasoning pipeline** (5 stages, described in Cognitive Architecture above)
- **Their own memory buffer** (sliding window of recent experience, ~2000 tokens)
- **Their own emotional state** (mood, patience, energy composite)
- **Their own agenda** (daily plans, refreshed each morning via LLM call)
- **Their own perception radius** (what they can see and hear based on location)
- **Their own conversation state** (active dialogue, pending responses, unresolved topics)

These are NOT shared. Dad's memory is different from Mom's memory. They experienced the same breakfast from different perspectives. Dad remembers Jack being happy; Mom remembers Jack being loud. Same event, different emotional encoding.

#### The Tick Loop — How 5 Agents Share Time

The simulation runs at 10Hz (10 ticks per second in game time). But ALL 5 agents cannot reason simultaneously — LLM calls take time and GPU memory is finite. Here's the scheduling:

```
TICK SCHEDULING:

Each character has a reasoning interval:
- Active character (choosing what to do): IMMEDIATE priority
- Character mid-activity: background thinking every ~25 seconds game time
- Character engaged in conversation: conversation pipeline (faster, 2-3 calls)
- Sleeping character: no reasoning unless woken by event

Stagger: Characters don't all reason on the same tick. 400ms delay between
character reasoning starts. This prevents GPU overload and creates natural
temporal offset (Mom finishes deciding before Dad starts — just like real
life where people aren't perfectly synchronized).

Priority queue:
1. Characters in CHOOSING state (need to decide what to do next)
2. Characters who received speech/events (need to react)
3. Characters in background thinking (lower priority, can wait)
```

**Why stagger matters for non-determinism:** Because agents reason sequentially with tiny delays, the ORDER in which they reason matters. If Mom decides before Jack, she might walk into the kitchen, and then when Jack reasons, he sees Mom in the kitchen and decides to ask for a snack. If Jack decides FIRST, he might go outside before Mom arrives. The stagger order rotates, creating legitimately different sequences of events from the same starting conditions.

#### 1. Perception — "What's happening around me?"
- See the room they're in. See who else is in the room. See what those people are doing
- Hear sounds from adjacent rooms (conversations, TV, music, crashes, crying)
- Notice the state of the environment (lights on/off, mess, food cooking, time of day)
- Notice their own body state (hungry, tired, need to pee, uncomfortable)
- Notice emotional states of others (Lily looks sad, Jack is being wild, Mom seems stressed)
- NOT omniscient — a character in the backyard doesn't know what's happening in the bedroom

**Implementation detail:** The `EnvironmentPerception` module constructs perception as a first-person narrative paragraph, NOT as JSON data. The LLM reads "You can hear Jack laughing in the backyard" not `{ nearbyCharacters: [{ name: "Jack", room: "backyard", activity: "playing" }] }`. Narrative perception activates the LLM's social reasoning capabilities because it's processing natural language, not data structures.

#### 2. Memory — "What do I remember?"
- Short-term: What happened in the last few minutes/hours. Recent conversations. Recent events
- Medium-term: What happened today. Morning routine. That argument with Emma. What they had for lunch
- Long-term: Persistent knowledge about family members. Inside jokes. Past conflicts. Relationship history
- Emotional memory: How did that interaction make me feel? The last time Jack lied about brushing his teeth. The time Lily drew me that beautiful picture
- Memory is imperfect: Characters might misremember details. Kids' memories are more vivid but less accurate. "You PROMISED!" — "I said MAYBE"
- Agenda memory: What was I planning to do today? What chores haven't been done?

**Implementation detail — The Memory Architecture:**
```
MEMORY LAYERS:

1. Immediate Context (always in prompt):
   - Last 3-5 events/interactions (with timestamps)
   - Current activity and its progress
   - Pending speech responses

2. Today's Memory (summarized, ~500 tokens):
   - LLM-generated summary of the day so far
   - Key emotional moments highlighted
   - Updated after significant events via Reflector

3. Relationship Memory (persistent, per-character):
   - Running narrative of relationship state
   - Updated after every interaction between the pair
   - Includes recent sentiment trend ("improving", "tense", "stable")

4. Agenda Memory:
   - Morning-generated daily plan
   - Checklist of completed/pending items
   - Modified throughout the day as plans change

5. Long-Term Personality (always in system prompt):
   - Core personality traits (never changes)
   - Speech style (never changes)
   - Quirks and habits (never changes)
   - Relationships (slowly evolving descriptions)
```

**How memory creates non-determinism:** The day summary is regenerated periodically. Each regeneration is an LLM call that SUMMARIZES recent events — and summarization is lossy. What the LLM considers "important enough to remember" varies between calls. Maybe one summary emphasizes Emma's morning fight with Mom. Another summary emphasizes the nice conversation Dad had with Lily. This affects ALL future reasoning because memory shapes perception.

#### 3. Internal Thought — "What am I thinking?"
- Characters should THINK before acting. Not just pick an action — reason through it
- "I'm hungry, but Lily is also playing with her toys and I promised to help her. Let me finish this first, then I'll eat."
- "Jack is being really loud again. I should tell him to quiet down, but Dave is handling it. I'll wait."
- "I really don't want to do dishes right now. But if I don't, Mom will get upset with me again. Ugh. Fine."
- Inner monologue reveals personality: Emma's is sarcastic and self-aware. Jack's is scattered and excitable. Lily's is whimsical and emotional. Dad's is methodical. Mom's is a running to-do list
- Thoughts are visible in the UI as thought bubbles — giving the player insight into each character's mind

**Implementation detail:** The thought is generated as part of the Deliberator output. The prompt explicitly asks for inner monologue BEFORE the action decision:

```
Think through your reasoning STEP BY STEP as {name} would think it.
Show your actual thought process — hesitations, contradictions, 
self-talk, emotional reactions. Then, based on that thinking, decide 
what to do.

Format:
{
  "thought": "your inner monologue goes here",
  "action": "what you decide to do",
  ...
}
```

**The thought chain IS the reasoning trace.** It's not decoration — it's the actual cognitive process the model went through to reach its decision. When you read it, you understand WHY the character did what they did, and it always makes sense within their personality. Not because we programmed it to make sense, but because the LLM reasons coherently from personality + context → decision.

#### 4. Planning — "What should I do next?"
- Characters form intentions, not just reactions
- Dad thinks: "It's Saturday. I should mow the lawn this morning, then we'll do pool time after lunch, and I'll grill for dinner."
- Mom thinks: "I need to do two loads of laundry today, prepare chicken for dinner, and make sure everyone bathes."
- Emma thinks: "I want to finish this chapter, then maybe swim if it's not too hot. I should probably help with dishes too or Mom will get on my case."
- Plans can be disrupted. Jack's plan to play outside gets derailed by rain. Mom's plan to garden gets interrupted by a sibling fight. Plans adapt
- Long-term goals: Mom wants to start teaching again. Emma wants to get better at art. Dad wants to finish his garage workbench project. These inform day-to-day choices

**Implementation detail — Morning Agenda Generation:**
Every morning, each character's pipeline runs a special "daily agenda" call:

```
It is {time} on {dayOfWeek}. You are {name}.
Yesterday: {yesterday_summary}
Your recurring responsibilities: {role_based_tasks}
Special today: {any_known_events_or_plans}

What do you want to accomplish today? Think about:
- What HAS to happen (responsibilities, promises made)
- What you WANT to do (personal desires, fun, social)
- What might get in the way (realistic obstacles)

Generate a loose plan, not a rigid schedule. Real people have 
intentions, not itineraries. Plans change. That's fine.
```

**Example agenda output (Mom, Saturday morning):**
```json
{
  "mustDo": [
    "Laundry — at least 2 loads, the towels are piling up",
    "Grocery list for Monday shopping",
    "Make sure Jack takes a real bath tonight, not the fake kind",
    "Dinner — maybe grill since Dave loves grilling on Saturdays"
  ],
  "wantToDo": [
    "Garden for a bit if it's not too hot",
    "Read my book during quiet time",
    "Maybe bake cookies with Lily — she's been asking"
  ],
  "anticipatedObstacles": [
    "Jack will want to swim ALL day and getting him out for dinner will be a fight",
    "Emma will probably sleep until noon if I let her",
    "Dave will disappear into yard work and lose track of time"
  ]
}
```

**Why agenda-based planning creates better behavior:** Without agendas, characters just react to immediate needs. With agendas, they have INTENTIONS that compete with immediate needs. Mom's Deliberator doesn't just see "hunger: low" — it also sees "I was going to bake cookies with Lily and I haven't done that yet." The tension between immediate needs and planned intentions is what creates realistic behavior.

#### 5. Decision — "I choose to do this."
- The actual action selection. Informed by perception, memory, thought, and planning
- NOT a selection from a menu. The LLM should be able to INVENT actions that aren't in the catalog
- "I'm going to make a card for Mom because she seemed stressed today" — this wasn't prompted. The agent perceived Mom's stress, remembered she likes thoughtful gestures, and created a response
- "I'm going to build a blanket fort because it's raining and we can't go outside" — creative problem-solving
- Decisions chain: micro-decisions (turn left in the hallway), medium decisions (what to do for the next 30 minutes), macro decisions (how to spend the afternoon)

#### 6. Reflection — "How did that go?"
- After actions complete, characters should reflect
- "That dinner came out really well. The kids ate everything. I should make this recipe again"
- "I shouldn't have yelled at Emma. She was just tired. I'll apologize before bed"
- "Jack actually cleaned up his toys without being asked. I need to tell him I'm proud"
- Reflection updates memory, mood, and future planning
- It's what separates a thinking agent from a state machine

### The Tool-Based Architecture

Instead of the LLM picking from a list, the LLM should have **tools** — capabilities it can invoke to interact with the world:

#### Movement Tools
- `moveTo(room)` — Walk to a specific room
- `moveTo(furniture)` — Walk to a specific piece of furniture
- `moveTo(person)` — Walk toward a specific family member
- `moveToBackyard(area)` — Go to a specific backyard zone (pool, playground, garden)

#### Object Interaction Tools
- `use(object)` — Use a piece of furniture or appliance (context-dependent)
- `pickup(item)` — Pick up an item
- `putdown(item, location)` — Put an item somewhere
- `open(container)` — Open fridge, closet, toy box, etc.
- `close(container)` — Close it
- `turnOn(device)` — Turn on lights, TV, faucet, stove, etc.
- `turnOff(device)` — Turn it off

#### Social Tools
- `say(target, message)` — Say something to a specific person
- `shout(message)` — Yell something hearable across the house
- `whisper(target, message)` — Say something only the target hears
- `emote(expression)` — Sigh, laugh, cry, groan, gasp
- `hug(target)` — Physical affection
- `comfort(target)` — Console someone who's upset
- `scold(target, reason)` — Discipline a child
- `praise(target, reason)` — Positive reinforcement
- `command(target, action)` — Give a directive (parent to child)

#### Self-Care Tools
- `eat(food)` — Eat something available
- `drink(beverage)` — Drink something
- `sleep()` — Go to sleep
- `nap()` — Take a short nap
- `rest()` — Sit down and relax
- `shower()` — Take a shower
- `bathe()` — Take a bath
- `brushTeeth()` — Brush teeth
- `changeClothes(type)` — Change into specific type of clothes (pajamas, swimsuit, day clothes)

#### Creative Tools
- `draw(subject)` — Draw something
- `paint(subject)` — Paint something
- `build(thing)` — Build with blocks, Lego, woodworking
- `read(book)` — Read a book
- `write(content)` — Write something (journal, list, letter)
- `play(instrument)` — Play a musical instrument
- `sing(song)` — Sing
- `imagine(scenario)` — Engage in imaginative play (Lily and Mr. Whiskers)

#### Household Tools
- `cook(recipe)` — Cook a specific thing
- `clean(object/area)` — Clean something
- `doLaundry(step)` — Perform a laundry step
- `mowLawn()` — Mow the lawn
- `water(plants)` — Water the garden
- `fix(object)` — Repair something broken
- `organize(area)` — Organize a messy area

#### Dynamic Creation — THE KEY INNOVATION
- `createAction(description)` — The LLM invents a new action not in any catalog
  - "Make shadow puppets on the wall with Lily using a flashlight"
  - "Set up an obstacle course in the backyard for the kids"
  - "Write a silly poem about Jack's dinosaur obsession and read it at dinner"
  - "Teach Lily how to tie her shoes using the bunny-ears method"
  - "Challenge Emma to a speed-drawing contest"
  - "Build a bird feeder with Jack from popsicle sticks"
  - "Start a family dance party in the living room"
  - "Make a treasure map of the backyard for the kids to follow"
  - "Organize a mini talent show after dinner"
  - "Create a secret handshake with each kid"
- This is the breakthrough. The agent can DO ANYTHING a real person could do in a house with a yard. It's not limited to a catalog. The catalog is a floor, not a ceiling

---

## Emergent Behavior — What We Want to See That We Never Programmed

The ultimate test of the simulation is whether it produces moments we didn't predict. Here's what emergence looks like and HOW the AI architecture makes it possible:

### How Emergence Happens — The Technical Mechanism

Emergence is not magic. It's what happens when multiple independent agents with rich internal state interact in a shared, constrained environment. Here are the specific conditions that create it:

1. **Agents reason independently** — Each character processes its own perception without knowing what other characters are thinking. This creates information asymmetry, which creates surprise
2. **The environment persists** — Object states, room occupancy, mess levels, food in the fridge — all survive between reasoning cycles. One agent's actions change what another agent perceives
3. **Memory creates narrative** — Because agents remember what happened, patterns form over time. If Dad always checks the locks before bed, that becomes "Dad's habit" — not because we programmed a lock-checking habit, but because his protective personality + nightly perception of unlocked doors = consistent behavior
4. **The LLM generalizes from persona** — We describe Sarah as "stressed by mess." We don't tell the LLM every specific way this manifests. But the LLM KNOWS (from training data) that stress about mess can manifest as aggressive cleaning, snapping at family members, reorganizing things that don't need reorganizing, or retreating to a clean room. These behavioral variations emerge from the persona, not from our code

### Organic Routines — How They Form Through AI

**The mechanism:** When a character does something at roughly the same time, in roughly the same circumstances, multiple days in a row, the LLM's daily memory summary starts including it as a pattern. "You usually check the locks around 10 PM." This memory entry makes the behavior MORE likely in future reasoning cycles, creating a self-reinforcing loop.

**This is how real habits form.** Not through a `habits[]` array in code, but through repeated behavior that becomes part of the agent's self-concept.

- Characters developing their own patterns that we didn't script
- Dad always checks the lock twice before bed (emerged from his protective personality)
- Emma starts leaving a drawing under Lily's pillow every night (emerged from their relationship)
- Jack and Lily develop a secret knock for their imaginary clubhouse (the sandbox)
- Mom hums the same song every time she does dishes — and eventually Lily starts humming it too

### Spontaneous Events — How Creative Actions Emerge

**The mechanism:** When conditions create an unusual combination (bored + found an interesting object + good mood + someone nearby who'd appreciate it), the LLM's Deliberator generates creative solutions via `createAction()`. The LLM doesn't need to be TOLD to start a water balloon fight — it needs to FIND water balloons while in a playful mood with siblings nearby.

- A water balloon fight that starts because Jack found the bag in the garage
- Emma teaching Lily to swim in the deep end — a milestone moment
- Dad falling asleep on the couch and all three kids piling blankets on him
- A family singalong that starts with Mom humming while cooking
- Jack refusing to eat until his dinosaur plate is available, then eating everything
- Lily leaving "I love you" notes around the house

### Conflict Resolution Without Rules — How AI Handles Making Up

**The mechanism:** After a conflict, each character's Reflector processes the event independently. Some personalities ruminate (Emma: "I shouldn't have said that"). Some move on fast (Jack: already thinking about dinosaurs). Some actively seek resolution (Mom: "I need to apologize for raising my voice"). The TIMING and NATURE of resolution depends entirely on personality, not a "conflict resolution subroutine."

- Siblings figuring out sharing on their own without parental intervention
- Emma apologizing to Mom unprompted after a fight
- Jack comforting Lily after he accidentally made her cry
- Parents having a disagreement and resolving it with humor rather than escalation
- Kids banding together to surprise a parent for no particular reason

### Personality Expression — How the AI Makes It Feel Real

**The mechanism:** Personality is in the SYSTEM PROMPT, not the code. The LLM processes personality as a holistic constraint on all output, the same way a method actor stays in character. When the system prompt says "Your sarcasm gets more creative under stress," the LLM doesn't just add a sarcastic comment — it generates SPECIFICALLY stress-appropriate sarcasm that escalates the more stressed Emma gets. This emerges from the interplay between persona and emotional state, not from a sarcasm_level variable.

- Emma's sarcasm getting increasingly creative under stress
- Jack's elaborate excuses for why he can't go to bed ("But what if the dinosaurs need me?")
- Lily having full conversations with Mr. Whiskers that reveal her inner emotional state
- Dad's puns getting worse as the day goes on
- Mom's cleaning becoming more aggressive when she's stressed (angry vacuuming)

### Relationship Evolution — How AI Grows Bonds Over Simulated Time

**The mechanism:** Every interaction between two characters updates both their relationship memories. Over many interactions, patterns form. The LLM reads these patterns in future prompts and adapts behavior accordingly. If Emma and Dad have had three good conversations this week, Emma's relationship memory includes "Dad and I have been connecting really well lately" — and this makes her MORE likely to seek him out for conversation, creating a positive feedback spiral.

The opposite also works: if Mom and Emma have fought three days in a row, both their memories carry that tension, making the next interaction MORE likely to be tense — a negative spiral that requires deliberate effort (from EITHER agent) to break.

- Two characters going through a rough patch and slowly recovering
- A child gradually earning more trust/autonomy from a parent
- Siblings developing inside jokes specific to their simulation history
- Parent-child conversations deepening as the child demonstrates maturity
- Family traditions forming organically (not scripted — Tuesday becomes "taco Tuesday" because they happened to do it a few weeks in a row)

---

## Edge Cases, Rare Events, and the Long Tail

### Illness and Injury
- Kids get sick. Stomach bugs. Colds. Fever
- Being sick changes everything: stay in bed, need care, can't do activities, need medicine, need comfort
- One sick kid → entire family schedule disrupted
- Injuries: scraped knees (common), stubbed toes, bumped heads (Jack runs into things)
- More serious: someone falls off monkey bars, slips by the pool, burns a hand on the stove
- Response hierarchy: assess → comfort → first aid → monitor → adjust plans

### Extreme Weather
- Thunderstorm: Lily panics. Everyone inside. Lightning safety. Power might flicker
- Heat wave: limit outdoor time. More pool. Hydration focus. AC working overtime
- Rain all day: trapped inside. Cabin fever. Boredom epidemic. Creative solutions needed
- Beautiful evening: spontaneous family time outside. Stargazing. Firefly catching

### Household Emergencies
- Power outage: flashlights, candles, no TV, no video games, no AC, opportunity for family bonding
- Plumbing issue: toilet clogged, sink overflowing — Dad's problem. Tools out. Kids fascinated or grossed out
- Smoke alarm goes off: someone burned food. Everyone reacts. Open windows. Fan the alarm. "False alarm, everyone!"
- Something breaks: window, furniture, toy. Response depends on what and who broke it
- Locked out: someone went to check mail and door locked behind them

### Social Situations
- Neighbor comes to the door (NPC interaction possibility)
- Phone call from family/friends (Mom's sister, Dad's mom)
- Package delivery
- Someone at school calls about Emma (during school year)
- Kids want to invite a friend over (future expansion)

### Emotional Crises
- Jack's existential crisis: "What if dinosaurs come back and they're mad?" — needs genuine parental comfort
- Lily's fear spiral: thunderstorm + forgot Clover + dark = full meltdown
- Emma's teen angst: feeling misunderstood, wanting independence, conflicted about growing up
- Mom's burnout: "I do EVERYTHING around here and nobody notices"
- Dad's work stress: bad day at work, bringing tension home, needs to not take it out on family
- Marital tension: a real argument. Not screaming. Cold silence, which is worse.
- Sibling jealousy: "You love her more than me"

### Boundary-Testing Behavior
- Jack testing every rule to find the actual limits
- Emma staying up later and later to see when parents enforce bedtime
- Lily asking "why?" not for knowledge but to delay something she doesn't want to do
- Kids observing which parent is more lenient and targeting their requests accordingly
- Negotiation escalation: "If I eat my vegetables, can I have TWO desserts?"

---

## What's Currently Broken and What Needs to Change

### Current State Analysis
The simulation currently has:
- A multi-agent LLM pipeline (Observer, Deliberator, Social Agent, Validator, Reflector)
- 112 predefined interactions across 14 categories
- Rich persona definitions with schedules, relationships, personalities
- Needs system (8 needs), skills system (7 skills), relationship tracking
- Speech and conversation systems with multiple conversation types
- Environmental perception and context building for LLM prompts
- Daily agenda planning via LLM
- Background thinking during activities
- Detailed logging and state tracking

### What's Not Working

#### 1. Actions Feel Predetermined
- Characters pick from the interaction catalog. Even with LLM reasoning, the output space is bounded by predefined actions
- There's no "invent something new" capability. The LLM selects, it doesn't create
- **How AI Fixes This:** Implement `createAction()` tool. The LLM's Deliberator output should support freeform action descriptions. The engine parses these through a lightweight classification call (what room? what animation? what duration? what needs effects?) and creates ephemeral action entries. The catalog becomes a training reference, not a ceiling. If the LLM says "build a pillow fort," the engine doesn't need a `pillow_fort` entry — it classifies this as creative_play, duration ~20min, fun +15, social +10, room=living_room, and executes it

#### 2. Conversations Are Surface-Level
- Characters say things, but sustained meaningful dialogue with emotional depth hasn't been achieved
- Conversations don't build on previous conversations. Each speech act feels standalone
- **How AI Fixes This:** Conversation memory must persist across the FULL day, not just the active dialogue. When Dad says "How was your day?" at dinner, the LLM needs access to the conversation he had with Emma at breakfast, the argument he overheard between the kids, and the fact that Mom hasn't mentioned the laundry she forgot. The conversation prompt must include: `CONVERSATION HISTORY TODAY: {summarized_interactions}` and `UNRESOLVED TOPICS: {things_mentioned_but_not_concluded}`. This turns surface chat into continuous family narrative

#### 3. Needs Drive Everything Too Mechanistically
- The system feels like "hunger is low → eat." It's a needs-satisfaction engine
- Real people don't always optimize. Sometimes you skip lunch because you're having fun. Sometimes you stay up too late reading because the book is good
- **How AI Fixes This:** Present needs as body sensations, not numbers (detailed in the Needs System section above). Add explicit anti-optimization instructions to the Deliberator prompt: "You are a person, not an optimizer. Personality-driven deviations from optimal need satisfaction are not just allowed — they're expected." Track personality-specific tendency overrides: Emma ignores sleep for books, Jack ignores hygiene always, Mom ignores her own hunger, Dad ignores family time during work focus

#### 4. Schedules Are Too Rigid
- Characters follow their agenda too closely. Real people deviate constantly
- A schedule should be a guide, not a script. "I was going to mow the lawn but the kids want to play and the weather is perfect. Lawn can wait"
- **How AI Fixes This:** The agenda goes into the prompt as a LOOSE LIST, not a schedule. Add to Deliberator prompt: `Your plan for today was: {agenda}. But plans change. If something more interesting, more urgent, or more emotionally compelling is happening RIGHT NOW, your plan can wait. What matters is what feels right in this moment for who you are.` The LLM naturally prioritizes compelling present-moment opportunities over abstract plans — this is a feature of how language models process context, not a bug

#### 5. Social Interactions Lack Depth
- Characters exist near each other but don't truly interact with the richness of a real family
- Arguments don't escalate naturally. Bonding moments don't build on shared history
- **How AI Fixes This:** The Social Agent stage must carry FULL relationship context. Not just `closeness: 0.85` but the narrative: "You and Emma have been tense all week. She rolled her eyes at you this morning. You grounded her for screen time and you're not sure you were right. She hasn't come out of her room in two hours." This narrative context gives the LLM everything it needs to produce socially aware behavior. Arguments escalate because the tension context is in the prompt. Bonding happens because the LLM recognizes an opportunity for repair

#### 6. No True Emergence
- Watching the simulation doesn't produce surprises. It produces expected behavior
- You can predict what each character will do in a given situation because the output space is bounded
- **How AI Fixes This:** The combination of all the above changes: unbounded action space (createAction), personality-filtered needs, loose agendas, rich relationship memory, and multi-agent interaction. Emergence isn't a feature you add — it's what happens when you remove the constraints that prevent it. The bounded action catalog, the need-optimization behavior, the rigid schedules, and the shallow social context are the WALLS preventing emergence. Tear them down and emergence happens naturally because that's what multiple reasoning agents in a shared environment DO

### The Path Forward

#### Phase 1: Foundation Fixes
- Implement tool-based action architecture (characters invoke tools, not select from menus)
- Add `createAction()` with dynamic action parsing and classification
- Implement proper conversation memory and threading (full day context, unresolved topics)
- Make needs presentation narrative, personality-filtered, with anti-optimization instructions
- Change agenda system from schedule to loose intention list

#### Phase 2: Depth
- Implement proper causal chains (engine tracks object state changes, LLM perceives consequences)
- Add interruption handling (save activity state, handle event via Social Agent, resume or abandon based on Deliberator)
- Implement escalation patterns through accumulating emotional state (patience decrements, mood cascading)
- Add environmental awareness beyond current room (sound propagation, visual awareness of adjacent rooms through open doors)

#### Phase 3: Emergence
- Tune LLM temperature for creativity vs coherence balance (0.8 for Deliberator, 0.6 for Social Agent, 0.9 for Reflector)
- Add serendipity through environmental events (doorbell, weather change, power flicker, spider in the bathroom)
- Implement habit formation through memory pattern detection
- Add organic routine formation (characters develop schedules the LLM infers from repeated behavior)

#### Phase 4: Polish
- Ensure time-of-day perception feels natural (the LLM reads "the afternoon sun is slanting through the kitchen window" not "time: 15:30")
- Make personality expression consistent across thousands of reasoning cycles
- Ensure family dynamics create the push-pull tension of real families through relationship memory richness
- Fine-tune the balance between structure and chaos by adjusting reasoning intervals and stagger timing

---

## The Non-Negotiable Principles

1. **Non-deterministic**: No two runs of the simulation should look the same. Given the same starting conditions, wildly different days should unfold. This is achieved through LLM sampling variance, context drift, memory asymmetry, and multi-agent interaction cascades
2. **No invisible walls**: If a person COULD do it in real life in that situation, the agent should be able to do it. `createAction()` is the mechanism. No artificial limits on the action space
3. **Consequences persist**: A fight at breakfast affects the whole day. A kindness at lunch is remembered at dinner. Time heals, but not instantly. This is achieved through emotional memory that persists in the Reflector output and feeds into future Deliberator prompts
4. **Personality is destiny**: Emma will ALWAYS be sarcastic. Jack will ALWAYS be energetic. Lily will ALWAYS be sensitive. These are their cores. But within that, infinite expression. This is achieved through immutable personality in the system prompt, with variable emotional state in the user prompt
5. **Imperfection is the goal**: Characters should make bad decisions. Skip meals. Forget chores. Say the wrong thing. Lose their temper. This isn't a bug — it's the point. The anti-optimization instructions in the Deliberator prompt guarantee this
6. **Family is messy**: Love coexists with frustration. Siblings fight AND protect each other. Parents disagree AND unite. Every relationship contains contradictions. The relationship memory naturally captures this because it stores BOTH positive and negative interactions
7. **Time flows naturally**: The simulation must respect the rhythm of a real day. Morning chaos. Midday drift. Afternoon slump. Evening bustle. Nighttime quiet. The environmental perception module embeds time as felt experience ("the morning light is coming through the kitchen window") not clock time
8. **Surprise the creator**: The ultimate success metric isn't that things work. It's that things happen that weren't planned, weren't scripted, weren't expected. The creator watches and says "I didn't tell them to do that. They just... did it." This comes from unbounded action space + rich personality + multi-agent interaction. You cannot predict what 5 independent LLM-driven agents will do in a shared house. That's the point

---

## Prompt Engineering — The Art Behind the Architecture

This section documents the specific prompt design principles that make the AI system work. These aren't abstract guidelines — they're concrete rules for constructing the prompts that drive every LLM call in the system.

### Principle 1: Personality In System Prompt, State In User Prompt

The system prompt (which persists across all calls for a character) contains ONLY immutable traits:
```
SYSTEM PROMPT (never changes during simulation):
You are Sarah Atomic, age 39. Former teacher. Stay-at-home mom.

PERSONALITY:
- Organized to a fault. You run this house like a well-oiled machine
- Warm but does not tolerate nonsense from the kids
- You notice messes before anyone else and they bother you intensely
- You are self-sacrificing — you skip meals, push through exhaustion — for the family
- Your stress manifests as aggressive cleaning or sharp words you immediately regret
- Deep down you miss teaching and feel like you've lost part of your identity

SPEECH STYLE:
- Direct. No beating around the bush
- Uses full names when angry: "Jack Thomas Atomic!"
- Pet names when loving: "sweetie", "honey", "babe" (to Dave)
- When tired, sentences get shorter and sharper
- When happy, she hums and sings fragments of songs

YOU ALWAYS:
- Wipe counters after any kitchen activity
- Check on sleeping kids before your own bedtime  
- Know exactly what's in the fridge
- Notice when someone's mood is off before they say anything

YOU NEVER:
- Leave the house disorganized intentionally
- Ignore a crying child
- Forget a promise to a child (but you might delay fulfilling it)
- Let the family eat unhealthily without at least commenting on it
```

The user prompt (which changes every reasoning cycle) contains current state:
```
USER PROMPT (rebuilt every cycle):
It is 2:47 PM on Tuesday. You are in the kitchen.

[PERCEPTION block — what you see, hear, smell]
[BODY STATE block — needs as sensations]  
[MEMORY block — recent events and emotional context]
[RELATIONSHIP STATE block — current state of all active relationships]
[AGENDA block — what you planned to do today]
[CONVERSATION STATE — any active dialogues]

What do you do? Think through it as Sarah would, then decide.
```

**Why this separation matters:** The system prompt is cached by the LLM API, reducing token cost per call by ~30%. More importantly, it ensures personality is STABLE while state is DYNAMIC. Sarah's core personality doesn't drift between calls.

### Principle 2: Never Present Data — Present Experience

Wrong:
```
Hunger: 28/100
Energy: 45/100  
Bladder: 72/100
nearbyCharacters: [Jack (kitchen), Lily (kids_room)]
activeActivity: null
```

Right:
```
Your stomach has been growling for the past twenty minutes. That salad at 
lunch wasn't enough. You keep glancing at the pantry.

You're tired — a deep, bone-weary tired that's been building since 2 PM. 
The kind where you could fall asleep if you sat down for more than five 
minutes. But there's too much to do.

You need to use the bathroom but it can wait a few more minutes. You've been
putting it off because Jack is in the bath and you just don't want to deal
with that bathroom right now.

Jack is in the kitchen, eating crackers and getting crumbs everywhere. You 
can hear Lily humming in the kids' room — she sounds happy.
```

**Why:** The experiential format activates the LLM's narrative reasoning. It processes "bone-weary tired" differently than "energy: 45" — it generates responses that FEEL tired, with shorter sentences, more irritability, less patience. The data format produces optimal responses. The experience format produces human responses.

### Principle 3: Embed Character-Specific Reasoning Instructions

Don't give all characters the same reasoning prompt. Each character thinks differently:

**Dad's reasoning instructions:**
```
Think methodically. Consider the practical implications. You weigh options.
You're patient — you don't rush to judgment. When you're not sure, you observe
for a moment. You solve problems; you don't dwell on them.
```

**Emma's reasoning instructions:**
```
Think in fragments. Your mind jumps between things. You're self-aware to a 
fault — you can see when you're being dramatic and you do it anyway. Your 
inner voice is sarcastic, even toward yourself. "Great, another exciting day
of... this." You notice things about people that the others miss.
```

**Jack's reasoning instructions:**
```
Think FAST. One thought crashing into the next. You don't plan — you 
DO. Everything is exciting or boring, nothing in between. Your inner voice
is loud, enthusiastic, and easily distracted. "OOOH WHAT'S THAT" in the 
middle of thinking about something else entirely. You don't weigh pros and
cons — you feel what you want and go for it.
```

**Lily's reasoning instructions:**
```
Think quietly. With wonder. You notice the beautiful things — how the light
looks through the window, how the flowers smell in the garden. You feel 
things deeply. When you're processing something emotional, you go quiet 
and still. You talk to Mr. Whiskers in your head when you need comfort.
Your inner voice often asks questions. "Why is Mommy sad?" "What if the 
thunder comes back?"
```

### Principle 4: The Temperature Strategy

Different pipeline stages benefit from different temperature settings:

| Stage | Temperature | Why |
|-------|-------------|-----|
| Observer/Perception | 0.0 | This is factual — no creativity needed, just accurate perception |
| Deliberator | 0.8–1.0 | Maximum creative variance here — this is where personality and non-determinism matter most |
| Social Agent | 0.5–0.7 | Moderate creativity — social awareness needs to be accurate but responses should vary |
| Reflector | 0.8–0.9 | High creativity for emotional processing — how a character FEELS about what happened should vary |
| Conversation speech | 0.9–1.0 | Highest creativity for dialogue — speech should be natural, varied, and surprising |
| Daily agenda | 0.7 | Moderate — plans should be coherent but not identical day to day |
| Action classification | 0.2 | Low — this is a parsing task, needs accuracy not creativity |

### Principle 5: Constrained Output Format Without Constraining Content

The output must be parseable by the engine, but the CONTENT of the output must be freeform:

```
Respond in this exact JSON format:
{
  "thought": "[YOUR INNER MONOLOGUE — be detailed, be honest, be in character]",
  "action": "[action tool name]",
  "target": "[target of action — room, object, or person]",
  "details": "[freeform description of what you're doing]",
  "speech": "[what you say, if anything — null if silent]",
  "speechTarget": "[who you're talking to, if anyone]",
  "speechTone": "[how you're saying it — warm, annoyed, tired, excited, etc.]",
  "emotionalShift": [number, -20 to +20],
  "nextIntention": "[what you're loosely planning to do after this]"
}

The "thought" and "speech" and "details" fields are YOUR creative space. 
Write whatever feels true to who you are in this moment. The other fields
help the game engine execute your decision.
```

---

## The Memory System — Deep Dive

Memory is what turns a sequence of independent decisions into a coherent life. Without memory, every reasoning cycle starts from scratch and characters feel like amnesiacs with personality. WITH memory, characters accumulate experience, form opinions, develop habits, hold grudges, and build relationships.

### The Four Memory Tiers

#### Tier 1: Immediate Buffer (Always in Prompt, ~500 tokens)
The last 3–5 events, verbatim. These are what happened in the last few minutes:
```
WHAT JUST HAPPENED:
[2:45 PM] You finished wiping the kitchen counter
[2:43 PM] You told Jack "Put that bowl in the sink"
[2:42 PM] Jack walked into the kitchen with a dirty cereal bowl
[2:30 PM] You came back inside from checking the garden
```

This buffer is FIFO — as new events happen, old ones drop off the end. This naturally creates the "forgot about the laundry" effect because events push each other out of immediate context.

#### Tier 2: Today's Running Summary (~800 tokens)
An LLM-generated narrative of the day so far. Updated every 30 game minutes by the Reflector:
```
TODAY SO FAR:
This morning was okay — not great, not terrible. Had a normal breakfast, 
arguments about Emma getting up as usual. Managed to clean the kitchen 
and start one load of laundry (still need to move it to the dryer — been 
putting that off). Had a really nice moment with Lily around 10 when she 
showed me her butterfly drawing. Jack has been a handful — already told 
him three times to stop running inside. 

The argument with Emma about screen time at 7:30 AM is still nagging at 
me. I said some things I didn't mean. I should talk to her about it later
but I don't have the energy right now.

Dave's been in his office since 8. I wish he'd come out and just... be 
around for a few minutes. I know he's working but it feels lonely sometimes.
```

**Why narrative, not bullets:** The LLM processes narrative summaries the way humans process memories — holistically, with emotional weight. A bullet list of events is clinical. A narrative carries the FEELING of the day. This means the next Deliberator call isn't just informed by what happened — it's informed by how the character FEELS about what happened.

**How the summary updates work:** Every 30 game minutes, a Reflector call runs:
```
Previous summary: {old_summary}
What happened since last summary: {recent_events_buffer}
Update the summary to include the new events. Keep the most emotionally 
significant moments. Let go of mundane details. Prioritize what {name} 
would actually remember.
```

This periodic summarization is where human-like memory distortion happens. The LLM naturally emphasizes emotional events over mundane ones, creates slight reframings based on current mood, and drops details that "don't matter" — exactly the way human memory works.

#### Tier 3: Relationship Memories (Per-Person, Persistent, ~200 tokens each)
Each character maintains a running relationship narrative for each family member:
```
YOUR RELATIONSHIP WITH EMMA:
Things have been tense this week. The screen time fight Monday was bad — you 
said "You spend your whole life in that room" and you saw it hurt her. She 
hasn't fully recovered from that. On the other hand, she helped Lily with 
homework on Wednesday without being asked and you were genuinely proud. You 
haven't told her that. Maybe you should. The trust is there but the daily 
friction is wearing both of you down. She's 14 and you remember being 14 and
hating your mom sometimes too. You just wish she knew how much you worry 
about her happiness.
```

These update after every interaction between the two characters, via Reflector output. They carry the emotional TEXTURE of the relationship — not just metrics, but the WHY behind the metrics.

#### Tier 4: Long-Term Patterns (Updated Weekly, ~300 tokens total)
Summary of patterns that emerge over simulated time:
```
PATTERNS YOU'VE NOTICED:
- Tuesday mornings are always harder. Everyone's still tired from the weekend
  energy crash
- Jack is easier to manage when he's had pool time in the afternoon
- Emma opens up more to Dave than to you lately (this stings but you 
  understand why)
- The family is happiest on Saturday evenings after a good day together
- You've been doing laundry at 9 AM almost every day — it's becoming 
  your routine
```

These patterns are generated by a weekly summary call that reviews the daily summaries. They give characters a sense of WISDOM about their family — the kind of knowledge you only get from living with people.

### How Memory Creates Non-Determinism

1. **Memory is lossy:** Each summary update loses detail. What's lost varies between runs
2. **Emotional weighting varies:** A good-mood summary emphasizes different events than a bad-mood summary
3. **Memory affects perception:** If Mom remembers "Jack has been difficult today," she interprets his next action through that lens — even if it's innocent
4. **Memory creates expectations:** "Dave usually checks in at 10 AM" — if he doesn't today, Mom notices the absence. This creates NEW reasoning that wouldn't exist without the memory
5. **Memory enables callbacks:** "You SAID I could have ice cream!" works because the promise is in the memory tier. If it's been pushed out of memory? Dad might have genuinely forgotten. And that matters for the family dynamic

---

## The Builder's Implementation Guide — How to Actually Build This

This section is for the developer (or AI agent) who is implementing this system. It bridges the gap between "here's the vision" and "write the code."

### Step 1: Fix the Perception Module

**Current:** `EnvironmentPerception.js` builds context as structured data.
**Target:** Build context as first-person narrative prose.

Transform this:
```javascript
// WRONG: Data format
context += `Nearby: ${nearby.map(c => c.name).join(', ')}`;
context += `Hunger: ${member.needs.hunger}`;
```

Into this:
```javascript
// RIGHT: Experience format  
context += describeNearbyPeople(member, nearby); 
// "Jack is sitting at the kitchen table, eating cereal and making a mess. 
//  You can hear Lily humming in the kids' room."
context += describeBodyState(member);
// "Your stomach is growling — that salad at lunch wasn't enough."
```

The perception module should read like a paragraph from a first-person novel, not a JSON dump.

### Step 2: Restructure the Deliberator Output

**Current:** The LLM picks an interaction ID from the catalog.
**Target:** The LLM outputs a structured action with freeform fields.

1. Change the Deliberator prompt to use the format from the Prompt Engineering section
2. Accept `createAction(description)` as a valid output alongside known action IDs
3. When `createAction()` is used, run a lightweight classification call to determine duration, room, needs effects, and animation category
4. Fall back to known catalog matches when the LLM's action description closely matches an existing entry

### Step 3: Implement the Conversation Pipeline

**Current:** Single-shot speech generation.
**Target:** Multi-turn conversation with context threading.

1. When a `say()` action targets another character, create a conversation session
2. The conversation session holds: participants, location, topic, turn history, emotional arc
3. Each turn runs through the target character's pipeline with conversation context
4. Conversations end when: one participant walks away, a third party interrupts, both participants run out of things to say, or an external event demands attention
5. After conversation ends, BOTH participants' Reflectors process the full conversation

### Step 4: Build the Memory System

**Current:** Recent event buffer in prompt.
**Target:** Four-tier memory system (detailed in Memory Deep Dive above).

1. **Immediate buffer:** Already exists — clean it up and ensure FIFO ordering
2. **Daily summary:** Every 30 game minutes, run a Reflector call that summarizes recent events into a running narrative. Store as a string per character
3. **Relationship memory:** After every 2-character interaction, run a mini-Reflector that updates the relationship narrative. Store as a map: `{ characterPair: narrativeString }`
4. **Pattern memory:** Every simulated week, run a summary call across all daily summaries. Extract patterns. Store as a persistent string per character

### Step 5: Implement the Emotional Cascade System

**Current:** Mood is a number that goes up and down.
**Target:** Mood is an accumulator that carries emotional context.

1. Each Reflector output includes `emotionalShift` (number) and `emotionalReason` (string)
2. The emotional reason is appended to a rolling emotional buffer
3. This buffer goes into the next Deliberator prompt as: `"Your emotional state right now: {emotional_buffer_summary}"`
4. When emotional buffer accumulates past a threshold (e.g., frustration > 50), flag it in perception: `"You've been getting increasingly frustrated all day. You can feel your patience wearing thin."`
5. This creates natural escalation — not through rules, but through cumulative emotional memory that influences each new decision

### Step 6: Validate Non-Determinism

Run the same starting condition twice. Watch for:
- ❌ Characters do the same things in the same order → temperature too low, or needs are dictating too mechanistically
- ❌ Characters do completely random things with no coherence → persona prompts too weak, or temperature too high
- ✅ Characters do different things that both make sense given their personality → system is working
- ✅ Small early differences cascade into very different afternoons → causal chains are propagating
- ✅ Conversations feel different even with similar topics → speech generation has proper variance
- ✅ Characters sometimes make suboptimal decisions that feel human → anti-optimization is working

---

## Appendix A: The Complete Need Decay and Restoration Table

### How This Table Is Used by the AI

These numbers are NOT given to the LLM. They run in the game engine deterministically. The ENGINE decays needs and applies restoration amounts. The LLM sees only the TRANSLATED EXPERIENCE of these numbers (as described in the Needs System section). The table exists for the engine developer, not for the AI.

| Need | Decay Rate (per game hour) | Activities That Restore | Restoration Amount | Critical Behaviors |
|------|---------------------------|------------------------|-------------------|-------------------|
| Energy | -3 base, -5 active, -1 resting | Sleep +8/hr, Nap +4/hr, Rest +1/hr | Full sleep = full restore | Falls asleep, can't focus, yawning |
| Hunger | -4 base, -6 active | Meal +40, Snack +15, Drink +5 | Must be cooked/available | Cranky, raiding pantry, can't think |
| Hygiene | -1 base, -3 active outside, -5 playing in dirt | Shower +60, Bath +50, Wash hands +5 | Requires bathroom | Others notice, comments, avoidance |
| Bladder | +3 base, +5 after drinks, +8 after coffee | Toilet -80, Full relief | One bathroom, occupied conflicts | Dancing, rushing, EMERGENCY |
| Social | -2 alone, -0.5 with people, +0 sleeping | Conversation +10, Group activity +5, Quality time +15 | Needs specific person sometimes | Clingy (Lily), pestering (Jack), withdrawn (Emma) |
| Fun | -2 chores, -1 idle, +0 sleeping | Play +10, Creative +8, Entertainment +6, Social fun +12 | Diminishing returns on repetition | Bored, restless, acting out, causing trouble |
| Comfort | -1 base, -3 hot/cold, -5 standing | Sit +3, Couch +5, Comfortable clothes +2 | Environmental factors | Fidgeting, complaining, distracted |
| Mood | Composite — affected by all other needs and events | Good interactions, accomplishments, fun | Direct +/- from events | Affects ALL other behavior and speech |

## Appendix B: Time-of-Day Activity Constraints

| Activity | Earliest | Latest | Notes |
|----------|---------|--------|-------|
| Mow lawn | 8:00 AM | 6:00 PM | Weekends primarily. Noise constraint |
| Swimming | 9:00 AM | 7:00 PM | Daylight. Adult supervision. Warm enough |
| Grilling | 4:00 PM | 7:30 PM | Dinner-oriented timing |
| Playground | 8:00 AM | 7:00 PM | Daylight. Weather permitting |
| Loud play outdoor | 8:00 AM | 8:00 PM | Noise after kids' bedtime = no |
| Cooking breakfast | 6:00 AM | 9:00 AM | Earlier on weekdays |
| Cooking dinner | 5:00 PM | 7:00 PM | Family meal anchor |
| Jack bedtime | 7:30 PM | 8:30 PM | Start bath at 7:15 PM |
| Lily bedtime | 8:00 PM | 9:00 PM | Start routine at 8:00 PM |
| Emma bedtime | 9:00 PM | 10:00 PM | Self-directed but monitored |
| Parents bedtime | 10:00 PM | 11:00 PM | After house check |
| Yard work | 8:00 AM | 5:00 PM | Saturday morning preferred |
| Gardening | 7:00 AM | 10:00 AM, 5:00–7:00 PM | Avoid midday heat |
| Work (Dad) | 8:00 AM | 5:00 PM | Weekdays only. Quiet zone |
| Hot tub | 7:00 PM | 10:00 PM | Evening activity. Parents or with older kids |

## Appendix C: Sound Propagation and Awareness

| Sound Type | Radius | Example |
|-----------|--------|---------|
| Whisper | Same room, close proximity | Secret between two people |
| Normal speech | Same room | Regular conversation |
| Raised voice | Same room + adjacent rooms | Firm parenting, calling someone |
| Shouting | Entire house | "DINNER!" or "STOP!" |
| Crying | 2 rooms radius | Child upset, hurt |
| Screaming | Entire house + backyard | Emergency, tantrum, excitement |
| Crash/bang | Entire house | Something broke, fell |
| TV/music | Same room at normal volume | Background entertainment |
| Running footsteps | Same room + adjacent (floor vibration) | Jack. Always Jack |
| Doorbell | Entire house | Visitor |
| Alarm (smoke/clock) | Entire house | Emergency or morning |
| Shower running | Same room + adjacent | Someone's in the bathroom |
| Lawn mower | Entire house + backyard | Outdoor, very loud |

## Appendix D: Personality Impact Matrix

How personality traits affect decision-making weight:

| Trait | Makes More Likely | Makes Less Likely |
|-------|-----------------|------------------|
| Patient (Dad) | Wait for others, give second chances, long conversations | Snap at kids, impulsive punishment |
| Organized (Mom) | Clean immediately, follow routines, plan ahead | Spontaneous activities, messy play |
| Sarcastic (Emma) | Witty comments, eye rolls, dramatic reactions | Earnest emotional speeches, eager compliance |
| Sensitive (Lily) | Cry at small things, notice others' feelings, seek comfort | Confront conflict, handle criticism, be alone |
| Impulsive (Jack) | Do before thinking, grab things, interrupt, run | Wait patiently, follow multi-step instructions |
| Introverted (Emma) | Alone time, reading, quiet activities | Initiate group activities, be energized by crowds |
| Extroverted (Jack) | Seek attention, talk to everyone, group play | Be content alone, quiet activities |
| Nurturing (Mom) | Comfort children, cook for others, check on family | Leave kids alone, ignore crying, skip meals |
| Protective (Dad) | Check safety, worry about kids, house security | Let kids take risks freely, be laid back about dangers |
| Creative (Lily, Emma) | Draw, paint, build, imagine, create stories | Repetitive tasks, strict routines, mundane chores |

## Appendix E: The 20 Relationship Pair Dynamics (Directional)

Each relationship is bidirectional but NOT symmetric — how Dad feels about Emma ≠ how Emma feels about Dad.

| From → To | Closeness | Trust | Respect | Dynamic |
|-----------|-----------|-------|---------|---------|
| Dad → Mom | 0.95 | 0.95 | 0.90 | Partner, co-parent, anchor |
| Mom → Dad | 0.95 | 0.95 | 0.90 | Partner, wishes he'd notice more |
| Dad → Emma | 0.80 | 0.85 | 0.75 | Proud, allows debate, protective |
| Emma → Dad | 0.80 | 0.85 | 0.80 | Respects patience, seeks intellectual bond |
| Dad → Lily | 0.90 | 0.90 | 0.85 | Wrapped around her finger |
| Lily → Dad | 0.90 | 0.95 | 0.90 | Adores, feels safest with him |
| Dad → Jack | 0.85 | 0.80 | 0.70 | Roughhousing buddy, firm |
| Jack → Dad | 0.90 | 0.85 | 0.75 | Hero worship |
| Mom → Emma | 0.85 | 0.80 | 0.75 | Worries, clashes, proud secretly |
| Emma → Mom | 0.75 | 0.75 | 0.70 | Loves but feels controlled |
| Mom → Lily | 0.95 | 0.95 | 0.90 | Mini-me, creative bond |
| Lily → Mom | 0.95 | 0.95 | 0.90 | #1 person in the world |
| Mom → Jack | 0.85 | 0.80 | 0.70 | Exhausting love |
| Jack → Mom | 0.85 | 0.85 | 0.65 | Sweet to get what he wants |
| Emma → Lily | 0.85 | 0.90 | 0.80 | Protector, teacher |
| Lily → Emma | 0.80 | 0.85 | 0.90 | Hero worship |
| Emma → Jack | 0.55 | 0.60 | 0.45 | Annoyed but loyal |
| Jack → Emma | 0.55 | 0.60 | 0.50 | Pest who wants her attention |
| Lily → Jack | 0.65 | 0.55 | 0.50 | Play partner, wary |
| Jack → Lily | 0.70 | 0.65 | 0.55 | Best friend and rival |

---

*This document is the north star for The Atomic Family simulation. Every design decision, every code change, every prompt refinement should move us closer to the vision described here: a family that feels real, that surprises us, that lives. The AI doesn't simulate a family — it IS five minds living under one roof. The architecture, the prompts, the memory, the tools — they exist to get out of the way and let those minds think, feel, decide, and grow. If you can replace any part of this system with a random number generator and get the same result, that part is broken. Fix it until the only thing that could produce this behavior is genuine reasoning.*

