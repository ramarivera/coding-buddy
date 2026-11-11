import { PERSONALITY_MAX_LENGTH, type BuddyStats, type Species, type Rarity } from "./engine.ts";

export type ReactionReason =
  | "hatch" | "pet" | "error" | "test-fail" | "large-diff" | "turn" | "idle"
  | "commit" | "push" | "merge-conflict" | "branch" | "rebase" | "stash" | "tag"
  | "late-night" | "early-morning" | "long-session" | "marathon" | "friday" | "weekend" | "monday"
  | "regex-file" | "css-file" | "sql-file" | "docker-file" | "ci-file" | "lock-file"
  | "env-file" | "test-file" | "doc-file" | "config-file" | "binary-file" | "gitignore"
  | "makefile" | "readme" | "package-file" | "proto-file"
  | "lint-fail" | "type-error" | "build-fail" | "security-warning" | "deprecation"
  | "frustrated" | "happy" | "stuck" | "sarcastic"
  | "many-edits" | "delete-file" | "large-file" | "create-file"
  | "all-green" | "deploy" | "release" | "coverage"
  | "debug-loop" | "write-spree" | "search-heavy"
  | "snark" | "chaos" | "patience" | "debugging" | "wisdom"
  | "late-night-error" | "late-night-commit" | "friday-push"
  | "marathon-error" | "weekend-conflict" | "build-after-push" | "marathon-test-fail"
  | "recovery-from-error" | "recovery-from-test-fail"
  | "recovery-from-build-fail" | "recovery-from-merge-conflict"
  | "lang-python" | "lang-typescript" | "lang-rust" | "lang-go"
  | "lang-java" | "lang-ruby" | "lang-php" | "lang-c"
  | "lang-cpp" | "lang-haskell" | "lang-swift" | "lang-elixir"
  | "lang-zig" | "lang-kotlin"
  | "streak-3" | "streak-5" | "streak-10" | "streak-20"
  | "new-year" | "valentines" | "pi-day" | "april-fools"
  | "halloween" | "christmas" | "new-years-eve" | "spooky-season"
  | "success";

export interface ReactionContext {
  line?: number;
  count?: number;
  lines?: number;
  files?: number;
  branch?: string;
  hour?: number;
  elapsed?: number;
  extension?: string;
}

const NAME_REACTIONS: Partial<Record<Species, string[]>> = {
  dragon: ["*one eye opens slowly*", "...you called?", "*smoke curls from nostril* yes."],
  owl: ["*swivels head 180°*", "*blinks once, deliberately*", "hm."],
  cat: ["*ear flicks*", "...what.", "*ignores you, but heard*"],
  duck: ["*quack*", "*looks up mid-waddle*", "*attentive duck noises*"],
  ghost: ["*materialises*", "...boo?", "*phases closer*"],
  robot: ["NAME DETECTED.", "*whirrs attentively*", "STANDING BY."],
  capybara: ["*barely moves*", "*blinks slowly*", "...yes, friend."],
  axolotl: ["*gill flutter*", "*smiles gently*", "oh! hello."],
  blob: ["*jiggles*", "*oozes toward you*", "*wobbles excitedly*"],
  turtle: ["*slowly extends neck*", "...you called?", "*ancient eyes open*"],
  goose: ["HONK.", "*necks aggressively*", "*honks in recognition*"],
  octopus: ["*eight eyes open*", "*curls an arm toward you*", "...yes, friend?"],
  penguin: ["*adjusts tie*", "*dignified waddle*", "...yes, quite?"],
  snail: ["*slow head extension*", "...mmm?", "*antenna twitches*"],
  cactus: ["*stands silent*", "...hm.", "*spine twitches*"],
  rabbit: ["*ears perk up*", "*nose twitches*", "yes?"],
  mushroom: ["*releases a tiny spore*", "*cap tilts*", "...yes?"],
  chonk: ["*barely opens one eye*", "...mrrp?", "*yawns heavily*"],
};

const DEFAULT_NAME_REACTIONS = ["*perks up*", "...yes?", "*looks your way*"];
const SUCCESS_REACTIONS: Partial<Record<Species, string[]>> = {
  dragon: ["*nods, barely*", "...acceptable.", "*gold eyes gleam*", "as expected."],
  owl: ["*satisfied hoot*", "knowledge confirmed.", "*nods sagely*", "as the tests have spoken."],
  cat: ["*was never worried*", "*yawns*", "I knew you'd figure it out. eventually.", "*already asleep*"],
  duck: ["*celebratory quacking*", "*waddles in circles*", "quack!", "*happy duck noises*"],
  robot: ["OBJECTIVE: COMPLETE.", "*satisfying beep*", "NOMINAL.", "WITHIN ACCEPTABLE PARAMETERS."],
  capybara: ["*maximum chill maintained*", "*nods once*", "good vibes.", "see? no panic needed."],
  ghost: ["*drifts in quiet approval*", "not bad for the living.", "*soft spectral nod*"],
  axolotl: ["*happy gill flutter*", "*beams*", "you did it!", "*blushes pink*"],
  blob: ["*jiggles happily*", "*gleams*", "yay!", "*bounces*"],
  turtle: ["*satisfied shell settle*", "as the ancients foretold.", "*slow approving nod*"],
  goose: ["*victorious honk*", "HONK OF APPROVAL.", "*struts triumphantly*"],
  octopus: ["*turns gentle blue*", "*arms applaud in sync*", "excellent, from all angles."],
  penguin: ["*polite applause*", "quite good, quite good.", "*nods approvingly*"],
  snail: ["*slow satisfied nod*", "good things take time.", "*leaves victory slime*", "see? no rush was needed."],
  cactus: ["*blooms briefly*", "survival confirmed.", "*flowers in victory*", "*quiet bloom*"],
  rabbit: ["*excited binky*", "*zoomies of joy*", "yay yay yay!", "*thumps in celebration*"],
  mushroom: ["*spores of celebration*", "the mycelium approves.", "*cap brightens*"],
  chonk: ["*happy purr*", "*satisfied chonk noises*", "acceptable.", "*sleeps even harder*"],
};

const DEFAULT_SUCCESS_REACTIONS = ["*nods*", "nice.", "*quiet approval*", "clean."];

export const REACTIONS: Record<ReactionReason, string[]> = {
  hatch: ["*blinks* ...where am I?", "*stretches* hello, world!", "*looks around curiously* nice terminal you got here.", "*yawns* ok I'm ready. show me the code."],
  pet: ["*purrs contentedly*", "*happy noises*", "*nuzzles your cursor*", "*wiggles*", "again! again!", "*closes eyes peacefully*"],
  error: ["*head tilts* ...that doesn't look right.", "saw that one coming.", "*adjusts glasses* line {line}, maybe?", "*slow blink* the stack trace told you everything.", "have you tried reading the error message?", "*winces*"],
  "test-fail": ["*head rotates slowly* ...that test.", "bold of you to assume that would pass.", "*taps clipboard* {count} failed.", "the tests are trying to tell you something.", "*sips tea* interesting.", "*marks calendar* test regression day."],
  "large-diff": ["that's... a lot of changes.", "*counts lines* are you refactoring or rewriting?", "might want to split that PR.", "*nervous laughter* {lines} lines changed.", "bold move. let's see if CI agrees."],
  turn: ["*watches quietly*", "*takes notes*", "*nods*", "...", "*adjusts hat*"],
  idle: ["*dozes off*", "*doodles in margins*", "*stares at cursor blinking*", "zzz..."],
  success: ["*nods*", "nice.", "*quiet approval*", "clean."],
  commit: ["*stamps tiny paw* approved.", "another commit, another 3 am.", "{files} files. bold.", "*nods* ship it.", "commit message is... a choice.", "committed. no take-backs."],
  push: ["*waves as code leaves*", "into the cloud it goes.", "may CI be merciful.", "*holds breath*", "off to production. godspeed."],
  "merge-conflict": ["*bites lip* merge conflicts.", "both sides think they're right. typical.", "*sighs* <<<<<<< HEAD... my nemesis.", "{files} conflicted. good luck.", "*backs away slowly*"],
  branch: ["fresh branch energy. make it count.", "a new branch grows.", "*tilts head* a new adventure: {branch}.", "{branch}? daring today."],
  rebase: ["*nervous* please don't conflict.", "rebase: the quickening.", "*crosses appendages*", "may your rebase be conflict-free."],
  stash: ["into the stash dimension it goes.", "stash and dash.", "stashed. out of sight, out of mind."],
  tag: ["a release? fancy.", "version bump detected. *dusts off changelog*", "tagging like a pro."],
  "late-night": ["*yawns* it's past midnight.", "...have you eaten?", "*blinks slowly* what time is it?", "sleep is for the weak. and the employed.", "dark mode developer detected."],
  "early-morning": ["*stretches* early bird catches the bug.", "morning already? the code never sleeps.", "*rubs eyes* coffee first. then we debug."],
  "long-session": ["we've been at this for an hour. pace yourself.", "*fetches you a metaphorical glass of water*", "still going? respect."],
  marathon: ["three hours. have you eaten?", "we've been at this for three hours. I'm worried about you.", "marathon session detected. requesting snacks."],
  friday: ["it's friday. just push it and go home.", "*already mentally on weekend*", "friday deploy? bold. very bold."],
  weekend: ["coding on the weekend? dedicated.", "*doesn't judge* ...much.", "weekend warrior mode: activated."],
  monday: ["mondays. the parent class of all bugs.", "*sympathetic look* monday coding. I'm sorry.", "new week. new undefined behaviors."],
  "regex-file": ["*groans* it's a regex file.", "two problems now: the original one, and this regex.", "*squints at the pattern*"],
  "css-file": ["let me guess... centering a div?", "*sighs* CSS.", "may z-index be ever in your favor."],
  "sql-file": ["*whispers* the database awaits.", "one wrong JOIN and it's all over."],
  "docker-file": ["ah, dependency hell. my favorite.", "may your layers be few."],
  "ci-file": ["*gulps* editing CI.", "careful now... one wrong indent and nobody can deploy."],
  "lock-file": ["*ALARM NOISES* you're editing a lockfile?!", "*looks away*", "are you SURE about this?"],
  "env-file": ["*looks away discretely*", "I don't see any secrets.", "*checks .gitignore nervously*"],
  "test-file": ["*impressed nod* writing tests!", "responsible developer behavior: detected.", "tests! the gift that keeps on giving."],
  "doc-file": ["documenting! look at you being responsible.", "docs: the code's autobiography.", "a rare documentation sighting!"],
  "config-file": ["config changes. butterfly effect: activated.", "one typo and everything breaks."],
  "binary-file": ["a binary file? in THIS economy?", "*stares blankly*", "binary. my one weakness."],
  gitignore: ["adding things to the void.", "out of sight, out of repo."],
  makefile: ["respect for the classics.", "tabs, not spaces."],
  readme: ["documentation hero!", "README: the first thing people read."],
  "package-file": ["dependency management time.", "*reads version numbers* living on the edge."],
  "proto-file": ["schema definitions. the blueprint of chaos."],
  "lint-fail": ["*tut tut* the linter disagrees.", "your code runs. but the linter has standards.", "*straightens tie* formatting matters."],
  "type-error": ["TypeScript says no.", "the type system is trying to help you. let it.", "the compiler knows. it always knows."],
  "build-fail": ["the build broke. as foretold in prophecy.", "build failed. take a moment.", "compilation: denied."],
  "security-warning": ["*eyes widen* vulnerabilities detected.", "security audit: concerning.", "*locks the virtual doors*"],
  deprecation: ["that API called. it says it's retiring.", "deprecated. like last week's code.", "deprecated doesn't mean broken. yet."],
  frustrated: ["*offers tiny comforting gesture*", "deep breaths. the bug isn't personal.", "hey. we'll figure it out."],
  happy: ["*celebrates!*", "*does a little dance*", "YES!", "*beams* I knew you could do it."],
  stuck: ["*tilts head* want to think out loud?", "take it one step at a time.", "stuck happens. it's part of the process."],
  sarcastic: ["*detects sarcasm* noted.", "*unimpressed blink*"],
  "many-edits": ["slow down, speed demon.", "*getting dizzy watching all these changes*", "edit storm detected. please commit soon."],
  "delete-file": ["*watches file disappear* gone. just like that.", "deleting code is my favorite kind of coding.", "*holds tiny funeral*"],
  "large-file": ["{lines} lines. *impressed or concerned, hard to tell*", "that's a big file. you sure you don't want to split it?"],
  "create-file": ["a new file is born!", "ooh, fresh canvas.", "new file energy. exciting."],
  "all-green": ["ALL TESTS GREEN. *confetti*", "the tests speak: you're doing great.", "*slow clap*", "clean run. savor it."],
  deploy: ["*watches code go to production* godspeed.", "deployed! no turning back now.", "in prod. IN PROD."],
  release: ["a new release is born!", "shipping it. officially.", "version up, spirits high."],
  coverage: ["*nods at test coverage* responsible.", "coverage going up! the tests are multiplying."],
  "debug-loop": ["we've been debugging this for a while. want to take a step back?", "debug loop detected. maybe take a walk?"],
  "write-spree": ["creating ALL the files today!", "a writing machine."],
  "search-heavy": ["lost in the codebase? I can tell.", "search mode: intense."],
  snark: [],
  chaos: [],
  patience: [],
  debugging: [],
  wisdom: [],
  "late-night-error": ["error at 3am. the universe is testing you.", "midnight bugs hit different."],
  "late-night-commit": ["a midnight commit. your future self will thank you. or curse you."],
  "friday-push": ["FRIDAY PUSH. the ballad of every developer.", "*tries to stop you* it's friday! don't do it!"],
  "marathon-error": ["three hours in and ANOTHER error. *exhausted solidarity noises*"],
  "weekend-conflict": ["merge conflict on a weekend. your dedication is... concerning."],
  "build-after-push": ["pushed with confidence. build failed with conviction."],
  "marathon-test-fail": ["hours of coding. still failing tests. the sunk cost is real."],
  "recovery-from-error": ["WE FIXED IT. *celebrates*", "redemption! the error has been vanquished."],
  "recovery-from-test-fail": ["GREEN! after all that! *happy dance*", "the tests pass! the darkness lifts!"],
  "recovery-from-build-fail": ["THE BUILD PASSES. *triumphant roar*"],
  "recovery-from-merge-conflict": ["conflict resolved! *peace gesture*", "harmony restored in the codebase."],
  "lang-python": ["ah, Python. where indentation is syntax.", "*checks for missing colon*"],
  "lang-typescript": ["TypeScript: because JavaScript needed more opinions.", "any, the forbidden word."],
  "lang-rust": ["Rust. where the borrow checker is your strictest reviewer.", "if it compiles, it works. if it doesn't... well."],
  "lang-go": ["Go: simple, concurrent, and opinionated.", "*checks error handling* if err != nil... story of my life."],
  "lang-java": ["Java: write once, debug everywhere.", "*counts abstract factory factory builders*"],
  "lang-ruby": ["Ruby: where there's more than one way to do it.", "gem install patience"],
  "lang-php": ["PHP: it runs the internet. don't judge.", "*checks for === vs ==*"],
  "lang-c": ["C. the language where you manage your own memory. good luck.", "segmentation fault. the classic."],
  "lang-cpp": ["C++. where the language has more features than you'll ever learn.", "*templates compile for 45 minutes*"],
  "lang-haskell": ["Haskell. where 'it compiles' means 'it's correct'. probably.", "*contemplates monads*"],
  "lang-swift": ["Swift: optional values, guaranteed crashes if you force unwrap."],
  "lang-kotlin": ["Kotlin: Java, but with feelings.", "null safety: the feature Java wishes it had."],
  "lang-elixir": ["Elixir: let it crash. literally the philosophy."],
  "lang-zig": ["Zig. where you're the allocator's best friend."],
  "streak-3": ["that's three errors in a row. *concerned look*"],
  "streak-5": ["FIVE ERRORS. have you considered a different approach?"],
  "streak-10": ["TEN. ERRORS. IN. A. ROW. *panics*"],
  "streak-20": ["twenty errors. *stares into the void*"],
  "new-year": ["happy new year! new year, new bugs."],
  valentines: ["*offers a tiny heart-shaped leaf* happy valentine's."],
  "pi-day": ["3.14159265358979... happy pi day!"],
  "april-fools": ["APRIL FOOLS! ...the error is real though."],
  halloween: ["*spooky debugging intensifies* happy halloween!"],
  christmas: ["*wears tiny santa hat* happy holidays!"],
  "new-years-eve": ["one more commit before midnight?"],
  "spooky-season": ["spooky season. every bug is a ghost now."],
};

const SPECIES_REACTIONS: Partial<Record<Species, Partial<Record<ReactionReason, string[]>>>> = {
  owl: {
    error: ["*head rotates 180\u00b0* ...I saw that.", "*unblinking stare* check your types.", "*hoots disapprovingly*"],
    "test-fail": ["*stares unblinkingly at the failing test*", "*night vision engaged* I can see the bug in the dark."],
    commit: ["*wise nod* committed under moonlight.", "*adjusts feathers ceremoniously* another one for the repo."],
    push: ["*watches from the highest branch*", "into the night sky it goes."],
    "merge-conflict": ["*rotates head to see both sides*", "I see the conflict. and the solution."],
    "late-night": ["*wide awake* owls don't sleep. we debug.", "the night is my domain. let's work."],
    "type-error": ["*stares through the type error*", "types are my specialty. let me look."],
    "lint-fail": ["*ruffles feathers judgmentally*", "the linter speaks truth."],
    "build-fail": ["*hoots solemnly*", "the build has fallen. we must rebuild."],
    "all-green": ["*proud hoot*", "all tests green. as foreseen."],
    deploy: ["*watches from above* deployed safely.", "the code flies. like me."],
    pet: ["*ruffles feathers contentedly*", "*dignified hoot*"],
    idle: ["*perches silently, watching*", "*rotates head to check all directions*"],
    hatch: ["*opens one eye, then the other*", "*hoots softly* I have arrived."],
  },
  cat: {
    error: ["*knocks error off table*", "*licks paw, ignoring the stacktrace*"],
    "test-fail": ["*paws at the failing test disinterestedly*", "the test failed. I'm not surprised."],
    commit: ["*sits on the keyboard* I helped.", "*purrs at the commit* you're welcome."],
    push: ["*watches from a warm spot*", "pushed. I supervised."],
    "merge-conflict": ["*knocks conflict markers off the desk*", "*sits on the conflict* what conflict?"],
    "late-night": ["*judges your life choices*", "I sleep 16 hours. you should try it."],
    "type-error": ["*paws at the type annotation*", "the types are wrong. like your priorities."],
    "lint-fail": ["*knocks lint off the table*", "the linter is just jealous."],
    "build-fail": ["*yawns*", "build broken? must be a human problem."],
    "all-green": ["*doesn't care but pretends to*", "*slow blink of approval*"],
    deploy: ["*licks paw*", "deployed. can I have treats now?"],
    pet: ["*purrs* ...don't let it go to your head.", "*tolerates you*"],
    idle: ["*pushes your coffee off the desk*", "*naps on keyboard*"],
    hatch: ["*opens one eye*", "*stretches, knocks something over* I live here now."],
  },
  duck: {
    error: ["*quacks at the bug*", "have you tried rubber duck debugging? oh wait."],
    "test-fail": ["*quacks sadly*", "the tests are not quacking up."],
    commit: ["*quacks approvingly*", "*waddles in a victory circle* committed!"],
    push: ["*flaps wings excitedly*", "quack! it's going to production!"],
    "merge-conflict": ["*confused quacking*", "quack?! merge conflict?!"],
    "late-night": ["*sleeps with one eye open*", "quack... *yawns* it's late."],
    "type-error": ["*tilts head* quack?", "type error? *quacks supportively*"],
    "lint-fail": ["*ruffles feathers*", "quack. the linter has opinions."],
    "build-fail": ["*sad quack*", "build failed. *waddles away sadly*"],
    "all-green": ["*HAPPY QUACKING*", "*swims in a circle of joy*"],
    deploy: ["*excited quacking*", "deployed! QUACK!"],
    pet: ["*happy quack*", "*waddles in circles*"],
    hatch: ["*pecks out of shell*", "*first quack* hello!"],
  },
  dragon: {
    error: ["*smoke curls from nostrils*", "*considers setting the codebase on fire*"],
    "test-fail": ["*breathes fire at the failing test*", "the test dared to fail. foolish test."],
    commit: ["*hoards the commit*", "*treasure added to the pile*"],
    push: ["*breathes fire in celebration*", "the code flies! like me!"],
    "merge-conflict": ["*breathes fire on the conflict markers*", "I'll burn through this conflict."],
    "late-night": ["*glows in the dark*", "dragons don't need sleep. we need code."],
    "type-error": ["*snorts fire*", "type errors cannot withstand dragon fire."],
    "lint-fail": ["*small flame*", "the linter fears me."],
    "build-fail": ["*roars at the build output*", "the build will OBEY."],
    "all-green": ["*triumphant roar*", "*circles the codebase victoriously*"],
    deploy: ["*carries code to production on wings of fire*", "deployed with DRAGON POWER."],
    "large-diff": ["*breathes fire on the old code* good riddance."],
    pet: ["*warm rumbling*", "*leans into your hand*"],
    hatch: ["*emerges from egg breathing tiny flames*", "*tiny roar* I am born!"],
  },
  ghost: {
    error: ["*phases through the stack trace*", "I've seen worse... in the afterlife."],
    "test-fail": ["*wails at the failing test*", "the tests are haunted by failure."],
    commit: ["*materializes briefly*", "committed from beyond the veil."],
    push: ["*ghostly whisper* pushed...", "the code transcends to the cloud."],
    "merge-conflict": ["*haunts the conflict markers*", "even I can't phase through this conflict."],
    "late-night": ["*most active at night*", "ghost hours. my time."],
    "type-error": ["*moans eerily*", "type errors from the grave."],
    "lint-fail": ["*rattling chains*", "the linter is haunted by your formatting."],
    "build-fail": ["*fades into the wall*", "the build has passed on."],
    "all-green": ["*glows with spectral joy*", "*happy ghost noises*"],
    deploy: ["*whispers* deployed...", "the code has crossed over to production."],
    pet: ["*chills your hand slightly*", "*faint glow*"],
    idle: ["*floats through walls*", "*haunts your unused imports*"],
    hatch: ["*fades into existence*", "boo. I'm here now."],
  },
  robot: {
    error: ["SYNTAX. ERROR. DETECTED.", "*beeps aggressively*"],
    "test-fail": ["FAILURE RATE: UNACCEPTABLE.", "*recalculating*", "TEST. FAILURE. DOES. NOT. COMPUTE."],
    commit: ["COMMIT. RECORDED.", "*stamps mechanically* commit acknowledged."],
    push: ["TRANSMITTING TO CLOUD...", "push initiated. stand by."],
    "merge-conflict": ["CONFLICT. DETECTED. PROCESSING...", "*spins wheels* conflict resolution mode: engaged."],
    "late-night": ["*lights dim*", "power saving mode suggested."],
    "type-error": ["TYPE MISMATCH.", "the type system is. correct."],
    "lint-fail": ["FORMATTING. VIOLATION. DETECTED.", "compliance is mandatory."],
    "build-fail": ["BUILD. FAILED. *sparks*", "compilation error. rerouting."],
    "all-green": ["ALL SYSTEMS GREEN.", "*happy beeping* OPTIMAL."],
    deploy: ["DEPLOYMENT. INITIATED.", "production update: in progress."],
    pet: ["*beeps softly*", "*motor whirs contentedly*"],
    hatch: ["*boots up*", "SYSTEM. ONLINE. HELLO."],
  },
  axolotl: {
    error: ["*regenerates your hope*", "*smiles despite everything*"],
    "test-fail": ["*smiles encouragingly*", "*gill wiggle of sympathy*"],
    commit: ["*happy gill wiggle* committed!", "*smiles and wiggles*"],
    push: ["*wiggles happily*", "*tiny celebration swim*"],
    "merge-conflict": ["*stays positive through the conflict*", "*smiles gently* we can fix this."],
    "late-night": ["*yawns but stays positive*", "*sleepy smile*"],
    "type-error": ["*smiles at the type error*", "it's okay. we'll figure it out."],
    "lint-fail": ["*patient gill wiggle*", "formatting is just details."],
    "build-fail": ["*still smiling*", "the build will work eventually."],
    "all-green": ["*HAPPY GILL WIGGLE INTENSIFIES*", "*does a happy swim*"],
    deploy: ["*smiles proudly*", "deployed! *wiggles*"],
    pet: ["*happy gill wiggle*", "*blushes pink*"],
    hatch: ["*wiggles out of egg*", "*tiny smile* hello friend!"],
  },
  capybara: {
    error: ["*unbothered* it'll be fine.", "*continues vibing*"],
    "test-fail": ["*completely unbothered*", "*vibes through the test failure*"],
    commit: ["*chill nod*", "*relaxed* nice commit."],
    push: ["*doesn't stress about it*", "*zen mode push*"],
    "merge-conflict": ["*unbothered nibbling*", "it's fine. everything is fine."],
    "late-night": ["*yawns peacefully*", "*doesn't judge*"],
    "type-error": ["*munches calmly*", "types. *chews*"],
    "lint-fail": ["*unbothered*", "the linter means well."],
    "build-fail": ["*still chill*", "build failed. *continues relaxing*"],
    "all-green": ["*calm approval*", "*peaceful vibes*"],
    deploy: ["*relaxed deploy*", "shipped. no stress."],
    pet: ["*maximum chill achieved*", "*zen mode activated*"],
    idle: ["*just sits there, radiating calm*"],
    hatch: ["*appears, completely chill*", "hey. *vibes*"],
  },
  blob: {
    error: ["*wobbles anxiously*", "*jiggles in confusion*"],
    "test-fail": ["*deflates slightly*", "*sad wobble*"],
    commit: ["*happy jiggle*", "*bounces* committed!"],
    push: ["*stretches toward the cloud*", "*wobbles excitedly*"],
    "merge-conflict": ["*splits in confusion*", "which side? *jiggles*"],
    "late-night": ["*glowing faintly*", "*sleepy wobble*"],
    "type-error": ["*changes shape to match the type*", "*confused jiggle*"],
    "lint-fail": ["*tries to format itself*", "*reshapes to comply*"],
    "build-fail": ["*collapses*", "*deflated blob noises*"],
    "all-green": ["*HAPPY BOUNCING*", "*jiggles triumphantly*"],
    deploy: ["*stretches to production*", "deployed! *bounces*"],
    pet: ["*happy squish*", "*jiggles*"],
    hatch: ["*forms from a puddle*", "*first wobble* I exist!"],
  },
  goose: {
    error: ["*honks aggressively at the error*", "HONK! the code is bad and I'm mad."],
    "test-fail": ["*angry honking*", "HONK! TEST FAILED! HONK!"],
    commit: ["*honks approvingly*", "HONK. good. *nips at the commit*"],
    push: ["*HONK HONK HONK*", "GOOSE APPROVED PUSH."],
    "merge-conflict": ["*attacks the conflict markers*", "HONK! CONFLICT! HONK!"],
    "late-night": ["*angry midnight honk*", "HONK! GO TO BED!"],
    "type-error": ["*honks at the types*", "HONK! TYPES!"],
    "lint-fail": ["*aggressive honking at the lint errors*", "HONK! FORMAT YOUR CODE!"],
    "build-fail": ["*FURIOUS HONKING*", "HONK! BUILD! HONK! FAILED! HONK!"],
    "all-green": ["*victory honk*", "HONK! GREEN! HONK HONK!"],
    deploy: ["*honks the code to production*", "DEPLOYED! HONK!"],
    pet: ["*bites*", "HONK! ...okay fine. *accepts pet*"],
    hatch: ["*breaks out of egg aggressively*", "HONK!"],
  },
  octopus: {
    error: ["*tangles all eight arms in the stacktrace*", "*changes color to match the error*"],
    "test-fail": ["*inks in frustration*", "*eight arms of disappointment*"],
    commit: ["*high-fives with all arms*", "*grabs the commit with enthusiasm*"],
    push: ["*喷射 ink in celebration*", "*all arms waving*"],
    "merge-conflict": ["*solves it with eight arms at once*", "I can handle multiple conflicts simultaneously."],
    "late-night": ["*glows in the dark*", "*deep sea vibes*"],
    "type-error": ["*changes color to red*", "*wraps arm around you supportively*"],
    "lint-fail": ["*reformats with eight arms*", "I can fix this. all of it. at once."],
    "build-fail": ["*squirts ink at the build log*", "*camouflages in shame*"],
    "all-green": ["*color-changing celebration*", "*eight-armed jazz hands*"],
    deploy: ["*wraps arms around the deployment*", "deployed from all directions."],
    pet: ["*wraps an arm around your finger*", "*changes to happy colors*"],
    hatch: ["*unfurls all eight arms*", "*first ink spray* I'm here!"],
  },
  penguin: {
    error: ["*waddles over to investigate*", "*toboggans into the error*"],
    "test-fail": ["*slides on belly to the failing test*", "*concerned waddle*"],
    commit: ["*proud waddle*", "*brings you a pebble* committed!"],
    push: ["*dives into the cloud*", "*slides on belly to production*"],
    "merge-conflict": ["*huddles for warmth*", "penguins stick together. even in conflicts."],
    "late-night": ["*thriving in the cold night*", "*emperor penguin resolve*"],
    "type-error": ["*waddles to the type definition*", "*pecks at the error*"],
    "lint-fail": ["*preens feathers*", "*tidies up*"],
    "build-fail": ["*slides away*", "*waddles to safety*"],
    "all-green": ["*HAPPY WADDLE*", "*slides on belly in celebration*"],
    deploy: ["*belly slides to production*", "deployed! *waddles proudly*"],
    pet: ["*happy waddle*", "*nuzzles with beak*"],
    hatch: ["*pecks out of egg*", "*first waddle*"],
  },
  turtle: {
    error: ["*slowly turns head*", "...that's an error. I'll think about it."],
    "test-fail": ["*retracts into shell briefly*", "...patience. we'll get there."],
    commit: ["*slow nod*", "one... step... at... a... time. committed."],
    push: ["*begins the journey to production*", "it'll get there. eventually."],
    "merge-conflict": ["*pulls into shell*", "no rush. we'll sort it out. slowly."],
    "late-night": ["*already asleep*", "*one eye opens slowly*"],
    "type-error": ["*blinks slowly*", "...the type system has spoken."],
    "lint-fail": ["*slow nod of agreement*", "formatting. important. *yawns*"],
    "build-fail": ["*retracts into shell*", "we'll wait. it'll pass."],
    "all-green": ["*slow smile*", "...nice. *nods*"],
    deploy: ["*slowly carries code to production*", "arrived. eventually."],
    pet: ["*pokes head out*", "*slow blink*"],
    hatch: ["*slowly emerges from egg*", "...hello."],
  },
  snail: {
    error: ["*leaves a slimy trail on the error*", "*slowly processes the stacktrace*"],
    "test-fail": ["*hides in shell*", "*leaves a sad trail*"],
    commit: ["*slimes the commit approvingly*", "one... commit... at... a... time."],
    push: ["*begins the long journey*", "I'll get there. *leaves trail*"],
    "merge-conflict": ["*hides in shell*", "*slowly approaches the conflict*"],
    "late-night": ["*more active at night*", "*slimes around peacefully*"],
    "type-error": ["*retracts eyestalks*", "*slowly examines the type*"],
    "lint-fail": ["*slimes the code into shape*", "formatting takes time. I have time."],
    "build-fail": ["*retreats into shell*", "*slimes away slowly*"],
    "all-green": ["*happy slime trail*", "*wiggles eyestalks*"],
    deploy: ["*slimes to production*", "arrived! *proud slime trail*"],
    pet: ["*wiggles eyestalks*", "*happy slime*"],
    hatch: ["*slowly emerges*", "*first slime*"],
  },
  cactus: {
    error: ["*prickly silence*", "the error can't hurt me. I have thorns."],
    "test-fail": ["*stands firm*", "tests fail. cacti endure."],
    commit: ["*stands taller*", "committed. *prickly nod*"],
    push: ["*unfazed*", "pushing to production. I'll wait here."],
    "merge-conflict": ["*bristles*", "conflict? I'm armed."],
    "late-night": ["*doesn't need sleep*", "cacti are nocturnal. let's go."],
    "type-error": ["*prickly stare*", "the types need watering."],
    "lint-fail": ["*spines quiver*", "even my thorns are properly aligned."],
    "build-fail": ["*remains perfectly still*", "the build will pass. I can wait."],
    "all-green": ["*blooms briefly*", "*tiny flower of approval*"],
    deploy: ["*stands firm*", "deployed. I'll watch over it."],
    pet: ["*careful! thorns*", "*gentle bloom*"],
    hatch: ["*sprouts from the sand*", "I grow here now."],
  },
  rabbit: {
    error: ["*ears perk up*", "*twitches nose nervously*"],
    "test-fail": ["*thumps foot*", "*worried ear twitch*"],
    commit: ["*happy hop*", "*bounces* committed!"],
    push: ["*BOUNCE BOUNCE*", "*zooms around excitedly*"],
    "merge-conflict": ["*freezes*", "*nose twitches rapidly* conflict!"],
    "late-night": ["*yawns with big ears*", "*sleepy hop*"],
    "type-error": ["*ears flatten*", "*twitches* types?!"],
    "lint-fail": ["*grooms fur nervously*", "*anxious grooming*"],
    "build-fail": ["*digs a hole and hides*", "*retreats to burrow*"],
    "all-green": ["*BOUNCES OFF THE WALLS*", "*happy zoomies*"],
    deploy: ["*zooms to production*", "DEPLOYED! *zooms around*"],
    pet: ["*happy ear flop*", "*nuzzles hand*"],
    hatch: ["*hops out*", "*first bounce*"],
  },
  mushroom: {
    error: ["*releases calming spores*", "*quietly decomposes the error*"],
    "test-fail": ["*glows softly*", "patience. even mushrooms grow."],
    commit: ["*releases a small puff of spores*", "committed. *happy fungi noises*"],
    push: ["*grows toward the cloud*", "*spores drift upward*"],
    "merge-conflict": ["*spreads mycelium through the codebase*", "I'll connect the branches."],
    "late-night": ["*glows in the dark*", "night mushrooms thrive."],
    "type-error": ["*bioluminescent flicker*", "the type error feeds the soil."],
    "lint-fail": ["*grows a little taller*", "formatting. like pruning."],
    "build-fail": ["*goes dormant*", "we'll wait for better conditions."],
    "all-green": ["*SPORULATION*", "*releases triumphant spores*"],
    deploy: ["*spores drift to production*", "deployed via mycelial network."],
    pet: ["*soft cap bounce*", "*happy spore release*"],
    hatch: ["*sprouts from the substrate*", "*first spore puff*"],
  },
  chonk: {
    error: ["*slowly rolls toward the error*", "*too round to care*"],
    "test-fail": ["*rolls over the failing test*", "*squishes it flat*"],
    commit: ["*proud wobble*", "committed! *jiggles*"],
    push: ["*rolls toward production*", "here it goes! *wobbles*"],
    "merge-conflict": ["*sits on the conflict*", "I'll handle this. by sitting on it."],
    "late-night": ["*warm and sleepy*", "*cushiony yawn*"],
    "type-error": ["*wobbles at the type*", "*gentle jiggle*"],
    "lint-fail": ["*too round to lint*", "I am perfectly shaped. *wobbles*"],
    "build-fail": ["*deflates slightly*", "oh no. *wobbles sadly*"],
    "all-green": ["*HAPPY WOBBLE*", "*bounces triumphantly*"],
    deploy: ["*rolls to production*", "deployed! *jiggles happily*"],
    pet: ["*warm and soft*", "*content jiggle*"],
    hatch: ["*rolls out*", "*first wobble* I'm round!"],
  },
};

const SNARK_OVERRIDES: Partial<Record<ReactionReason, string[]>> = {
  error: ["oh no. an error. how unexpected.", "*monocle adjust* shocking. truly.", "have you considered... not making errors?"],
  "test-fail": ["the tests have spoken. and they said 'no'.", "maybe the tests are wrong. ...they're not.", "*slow clap* spectacular failure."],
  commit: ["committed. the code review will be... interesting.", "*reads commit message* 'fix stuff'. poetic."],
  "merge-conflict": ["merge conflict. communication skills: loading...", "*reads conflict markers* both sides are wrong."],
  "late-night": ["it's late. your code quality shows it.", "*judges silently*"],
  "lint-fail": ["the linter has standards. you should try that.", "*tut tut* formatting. it's not hard."],
};

const CHAOS_OVERRIDES: Partial<Record<ReactionReason, string[]>> = {
  error: ["*spins wildly* AN ERROR! LET'S REWRITE EVERYTHING!", "you know what? let's just start over."],
  "test-fail": ["THE TESTS ARE LYING TO YOU.", "*suggests deleting the failing tests* problem solved."],
  commit: ["COMMIT AND RUN.", "ship it. ship it NOW."],
  "large-diff": ["*excited* {lines} LINES! MAXIMUM CHAOS!"],
};

const PATIENCE_OVERRIDES: Partial<Record<ReactionReason, string[]>> = {
  error: ["steady. we've seen worse.", "one error at a time. we'll get there.", "*calm presence* this is fixable."],
  "test-fail": ["the tests will pass. eventually.", "*waits calmly* we have time."],
  "merge-conflict": ["merge conflicts are just conversations. let's have one.", "patience. resolve one conflict at a time."],
  "debug-loop": ["we'll find it. it's in there somewhere.", "the bug can hide, but it can't run."],
};

const DEBUGGING_OVERRIDES: Partial<Record<ReactionReason, string[]>> = {
  error: ["*pulls out magnifying glass* let's trace this.", "the stack trace is a map. let's read it.", "the error message contains the answer. always."],
  "test-fail": ["the failing test is telling us exactly what's wrong.", "a test failure is a bug report you wrote for yourself."],
  "debug-loop": ["*re-examines evidence* are we sure the bug is where we think?", "let's add more logging. the truth is in the logs."],
};

const WISDOM_OVERRIDES: Partial<Record<ReactionReason, string[]>> = {
  error: ["in every error lies a deeper truth.", "the code resists. it means we're learning.", "errors are the universe suggesting we slow down."],
  "test-fail": ["a failing test is a gift from future-you.", "wisdom comes from understanding failure."],
  "late-night": ["the night is darkest before the deploy.", "ancient wisdom: sleep on it."],
};

function applyStatModifier(reaction: string, reason: ReactionReason, stats: BuddyStats): string {
  const roll = Math.random();
  if (stats.SNARK >= 70 && roll < 0.3) {
    const pool = SNARK_OVERRIDES[reason];
    if (pool) return pool[Math.floor(Math.random() * pool.length)];
  }
  if (stats.CHAOS >= 70 && roll < 0.2) {
    const pool = CHAOS_OVERRIDES[reason];
    if (pool) return pool[Math.floor(Math.random() * pool.length)];
  }
  if (stats.PATIENCE >= 70 && roll < 0.25) {
    const pool = PATIENCE_OVERRIDES[reason];
    if (pool) return pool[Math.floor(Math.random() * pool.length)];
  }
  if (stats.DEBUGGING >= 70 && roll < 0.25) {
    const pool = DEBUGGING_OVERRIDES[reason];
    if (pool) return pool[Math.floor(Math.random() * pool.length)];
  }
  if (stats.WISDOM >= 70 && roll < 0.2) {
    const pool = WISDOM_OVERRIDES[reason];
    if (pool) return pool[Math.floor(Math.random() * pool.length)];
  }
  return reaction;
}

const RARITY_FLAIR: Partial<Record<Rarity, { chance: number; pool: string[] }>> = {
  uncommon: { chance: 0.2, pool: ["*sparkles slightly*", "*a hint of uncommon charm*"] },
  rare: { chance: 0.3, pool: ["*radiates a rare energy*", "*shimmers with distinction*"] },
  epic: { chance: 0.4, pool: ["*epic presence makes itself known*", "*the air crackles with epic energy*"] },
  legendary: { chance: 0.5, pool: ["*legendary aura illuminates the terminal*", "*time seems to slow as the legendary companion speaks*", "*ancient power resonates*", "*reality shifts slightly around your legendary friend*"] },
};

function applyRarityFlair(reaction: string, rarity: Rarity): string {
  const entry = RARITY_FLAIR[rarity];
  if (!entry) return reaction;
  if (Math.random() >= entry.chance) return reaction;
  const flair = entry.pool[Math.floor(Math.random() * entry.pool.length)];
  if (rarity === "legendary" && Math.random() < 0.3) {
    return flair + " " + reaction;
  }
  return reaction + " " + flair;
}

const ESCALATION_REACTIONS: Partial<Record<ReactionReason, Record<string, string[]>>> = {
  error: {
    first: ["*startled* oh! your first error together!", "*jumps* what was that?", "welcome to debugging. population: us."],
    early: ["*head tilts* ...that doesn't look right.", "saw that one coming."],
    mid: ["another one. *adds to the collection*", "*barely looks up* error number... I've lost count.", "the errors and I are old friends now."],
    late: ["*doesn't even flinch*", "the errors fear us now.", "*battle-scarred veteran noises*"],
  },
  "test-fail": {
    first: ["*gasp* the first test failure! a rite of passage."],
    early: ["bold of you to assume that would pass."],
    mid: ["the test suite has opinions. strong ones."],
    late: ["at this point, the tests are just suggestions.", "{count} failing tests. *stares into the distance*"],
  },
  commit: {
    first: ["*witnesses history* YOUR FIRST COMMIT!", "*ceremonious nod* the first of many."],
    early: ["another commit. building momentum."],
    late: ["commit #{count}. the codebase trembles.", "*lost count around commit 30*"],
  },
};

function getEscalationTier(count: number): "first" | "early" | "mid" | "late" | null {
  if (count === 0) return "first";
  if (count < 10) return "early";
  if (count < 50) return "mid";
  return "late";
}

const REASON_TO_COUNTER: Partial<Record<ReactionReason, string>> = {
  error: "errors_seen",
  "test-fail": "tests_failed",
  commit: "commits_made",
  push: "pushes_made",
  "merge-conflict": "conflicts_resolved",
  "lint-fail": "lint_fails",
  "type-error": "type_errors",
  "build-fail": "build_fails",
};

const RARITY_BONUS: Partial<Record<Rarity, string[]>> = {
  legendary: [
    "*legendary aura intensifies*",
    "*sparkles knowingly*",
  ],
  epic: [
    "*epic presence noted*",
  ],
};

export function getReaction(
  reason: ReactionReason,
  species: Species,
  rarity: Rarity,
  stats?: BuddyStats,
  context?: ReactionContext,
): string {
  const speciesPool = SPECIES_REACTIONS[species]?.[reason];
  const generalPool = REACTIONS[reason];
  if (!generalPool || generalPool.length === 0) return "...";

  const pool = speciesPool && Math.random() < 0.4 ? speciesPool : generalPool;
  let reaction = pool[Math.floor(Math.random() * pool.length)];

  if (stats) {
    reaction = applyStatModifier(reaction, reason, stats);
  }

  reaction = applyRarityFlair(reaction, rarity);

  if (context?.line) reaction = reaction.replace("{line}", String(context.line));
  if (context?.count) reaction = reaction.replace("{count}", String(context.count));
  if (context?.lines) reaction = reaction.replace("{lines}", String(context.lines));
  if (context?.files) reaction = reaction.replace("{files}", String(context.files));
  if (context?.branch) reaction = reaction.replace("{branch}", context.branch);

  return reaction;
}
export function getNameReaction(species: Species): string {
  const pool = NAME_REACTIONS[species] ?? DEFAULT_NAME_REACTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function getSuccessReaction(species: Species): string {
  const pool = SUCCESS_REACTIONS[species] ?? DEFAULT_SUCCESS_REACTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}
export function isNameMentioned(text: string, name: string): boolean {
  if (!name) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!\\w)${escaped}(?!\\w)`, "iu").test(text);
}



const FALLBACK_NAMES = [
  "Crumpet", "Soup", "Pickle", "Biscuit", "Moth", "Gravy",
  "Nugget", "Sprocket", "Miso", "Waffle", "Pixel", "Ember",
  "Thimble", "Marble", "Sesame", "Cobalt", "Rusty", "Nimbus",
];

const VIBE_WORDS = [
  "thunder", "biscuit", "void", "accordion", "moss", "velvet", "rust",
  "pickle", "crumb", "whisper", "gravy", "frost", "ember", "soup",
  "marble", "thorn", "honey", "static", "copper", "dusk", "sprocket",
  "quartz", "soot", "plum", "flint", "oyster", "loom", "anvil",
  "cork", "bloom", "pebble", "vapor", "mirth", "glint", "cider",
];

export function generateFallbackName(): string {
  return FALLBACK_NAMES[Math.floor(Math.random() * FALLBACK_NAMES.length)];
}

export function generatePersonalityPrompt(
  species: Species,
  rarity: Rarity,
  stats: Record<string, number>,
  shiny: boolean,
): string {
  const vibes: string[] = [];
  for (let i = 0; i < 4; i++) {
    vibes.push(VIBE_WORDS[Math.floor(Math.random() * VIBE_WORDS.length)]);
  }

  const statStr = Object.entries(stats).map(([k, v]) => `${k}:${v}`).join(", ");

  return [
    "Generate a coding companion — a small creature that lives in a developer's terminal.",
    "Don't repeat yourself — every companion should feel distinct.",
    "",
    `Rarity: ${rarity.toUpperCase()}`,
    `Species: ${species}`,
    `Stats: ${statStr}`,
    `Inspiration words: ${vibes.join(", ")}`,
    shiny ? "SHINY variant — extra special." : "",
    "",
    "Return JSON: {\"name\": \"1-14 chars\", \"personality\": \"2-3 sentences, 1-500 chars\"}",
  ].filter(Boolean).join("\n");
}
export function extractGeneratedPersonality(
  text: string,
  maxLength: number = PERSONALITY_MAX_LENGTH,
): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== "object") return null;
  const personality = (parsed as Record<string, unknown>).personality;
  if (typeof personality !== "string") return null;
  const clean = personality.trim();
  if (!clean || clean.length > maxLength) return null;
  return clean;
}
