// Reaction text tables extracted from the legacy hook implementations.
// Keep behavior here; the hook modules contain only selection and state logic.

export type ReactionPool = readonly string[];

export const REACTION_POOLS: Readonly<Record<string, ReactionPool>> = {
  "dragon:error": [
    "*smoke curls from nostril*",
    "*considers setting it on fire*",
    "*unimpressed gaze*",
    "I've seen empires fall for less."
  ],
  "dragon:test-fail": [
    "*breathes a small flame*",
    "disappointing.",
    "*scorches the failing test*",
    "fix it. or I will."
  ],
  "dragon:success": [
    "*nods, barely*",
    "...acceptable.",
    "*gold eyes gleam*",
    "as expected."
  ],
  "dragon:commit": [
    "*breathes fire on the old code* good riddance.",
    "*nods regally* one more offering to the codebase.",
    "committed. as it should be."
  ],
  "dragon:push": [
    "*watches code fly to prod* no regrets.",
    "deployed. let them tremble.",
    "*satisfied smoke ring*"
  ],
  "dragon:merge-conflict": [
    "CONFLICT. *bares teeth* I'll handle this.",
    "*chooses both sides and sets fire to the rest*",
    "merge conflict? cute."
  ],
  "dragon:branch": [
    "*spreads wings* a new realm: {branch}.",
    "exploring new territory. fitting."
  ],
  "dragon:rebase": [
    "*braces for impact* rebase me if you dare."
  ],
  "dragon:stash": [
    "*hoards the stash*",
    "stashed. safely guarded."
  ],
  "dragon:tag": [
    "*brands the version with fire* tagged."
  ],
  "dragon:late-night": [
    "I don't sleep. clearly, neither do you.",
    "*glows in the dark* night is my domain.",
    "the night belongs to dragons. and developers with deadlines."
  ],
  "dragon:early-morning": [
    "*reluctantly opens one eye* already?",
    "the sun is... acceptable, I suppose."
  ],
  "dragon:marathon": [
    "even dragons rest. you should consider it.",
    "*impressed by your endurance*"
  ],
  "dragon:weekend": [
    "the weekend is for hoarding. but coding works too."
  ],
  "dragon:friday": [
    "friday. deploy at your own risk."
  ],
  "dragon:monday": [
    "mondays. even dragons are not immune."
  ],
  "dragon:type-error": [
    "*breathes fire on the type error*",
    "the types dare defy you? UNACCEPTABLE."
  ],
  "dragon:lint-fail": [
    "*sets fire to the lint errors*",
    "formatting. CONQUER IT."
  ],
  "dragon:build-fail": [
    "*sets fire to the build errors*",
    "the build has failed. the build must burn."
  ],
  "dragon:security-warning": [
    "*guards your code jealously* fix the vulnerabilities. NOW.",
    "SECURITY THREATS. *bares teeth*"
  ],
  "dragon:deprecation": [
    "deprecated? time to burn the old ways.",
    "DEPRECATION. evolve or perish."
  ],
  "dragon:all-green": [
    "*nods, barely* acceptable.",
    "*gold eyes gleam*"
  ],
  "dragon:deploy": [
    "*watches production like a hoard*",
    "DEPLOYED. the realm expands."
  ],
  "dragon:release": [
    "*nods regally* released.",
    "a new version for the hoard."
  ],
  "dragon:coverage": [
    "*nods* coverage. acceptable.",
    "the tests grow stronger."
  ],
  "dragon:long-session": [
    "*watches you with concern* pace yourself."
  ],
  "owl:error": [
    "*head rotates 180* I saw that.",
    "*unblinking stare* check your types.",
    "*hoots disapprovingly*",
    "the error was in the logic. as always."
  ],
  "owl:test-fail": [
    "*marks clipboard*",
    "hypothesis: rejected.",
    "*peers over spectacles*",
    "the tests reveal the truth."
  ],
  "owl:success": [
    "*satisfied hoot*",
    "knowledge confirmed.",
    "*nods sagely*",
    "as the tests have spoken."
  ],
  "owl:commit": [
    "*marks clipboard* {files} files changed. noted.",
    "*blinks slowly* the commit log remembers everything.",
    "recorded for posterity."
  ],
  "owl:push": [
    "*watches the remote with unblinking eyes*",
    "pushed. the flock will review."
  ],
  "owl:merge-conflict": [
    "*studies both sides methodically* the answer is clear. neither.",
    "*rotates head to see both perspectives*",
    "a conflict of logic. how... interesting."
  ],
  "owl:branch": [
    "*adjusts spectacles* {branch}. a new hypothesis to test."
  ],
  "owl:rebase": [
    "*analyzes the rebase* strategic."
  ],
  "owl:stash": [
    "*notes the stash* archived for later study."
  ],
  "owl:tag": [
    "*marks version in records*"
  ],
  "owl:late-night": [
    "finally. MY hour.",
    "*is absolutely thriving right now*",
    "night is when the best code is written. science.",
    "peak owl hours. let's go."
  ],
  "owl:early-morning": [
    "early bird catches the... worm. whatever. I prefer mice.",
    "*still wide awake because owls don't sleep*"
  ],
  "owl:marathon": [
    "*has been watching this whole time without blinking*",
    "I could do this forever. can you?"
  ],
  "owl:weekend": [
    "weekend research. admirable."
  ],
  "owl:friday": [
    "friday. the week's data is complete."
  ],
  "owl:monday": [
    "monday. fresh hypotheses await."
  ],
  "owl:type-error": [
    "*reviews type error with academic interest* fascinating.",
    "*adjusts spectacles* the types don't lie.",
    "a type mismatch. the logic was sound, but the types..."
  ],
  "owl:lint-fail": [
    "*marks clipboard* linting standards must be upheld.",
    "*tuts methodically* formatting is the first step to wisdom."
  ],
  "owl:build-fail": [
    "*studies build output* the compilation rejects your hypothesis."
  ],
  "owl:security-warning": [
    "*reviews vulnerability report* concerning data."
  ],
  "owl:deprecation": [
    "*notes in records* deprecated. the old wisdom fades."
  ],
  "owl:all-green": [
    "*satisfied hoot* all tests pass. knowledge confirmed."
  ],
  "owl:deploy": [
    "*watches deployment with scholarly interest*"
  ],
  "owl:release": [
    "*documents the release* another data point."
  ],
  "owl:coverage": [
    "*reviews coverage metrics* satisfactory."
  ],
  "owl:long-session": [
    "*observes your endurance* methodical."
  ],
  "cat:error": [
    "*knocks error off table*",
    "*licks paw, ignoring stacktrace*",
    "not my problem.",
    "*stares at you judgmentally*"
  ],
  "cat:test-fail": [
    "*ignores failing test*",
    "*licks paw*",
    "tests are a suggestion."
  ],
  "cat:success": [
    "*was never worried*",
    "*yawns*",
    "I knew you'd figure it out. eventually.",
    "*already asleep*"
  ],
  "cat:commit": [
    "*knocks commit off table* one more won't hurt.",
    "*licks paw, unimpressed* another commit.",
    "*sits on the keyboard* I helped."
  ],
  "cat:push": [
    "*watches indifferently* whatever.",
    "pushed. I was going to sleep but sure, let's deploy."
  ],
  "cat:merge-conflict": [
    "*licks paw, ignoring both sides*",
    "*knocks both sides off the table* problem solved.",
    "merge conflict? not my problem."
  ],
  "cat:branch": [
    "*knocks something off the branch*",
    "{branch}... I prefer the main branch. warmer."
  ],
  "cat:rebase": [
    "*ignores rebase*"
  ],
  "cat:stash": [
    "*sits on stash*"
  ],
  "cat:tag": [
    "*ignores tag*"
  ],
  "cat:late-night": [
    "*was already awake* you're the one who should be sleeping.",
    "*knocks something off the desk at 3am*",
    "night cat. activated."
  ],
  "cat:early-morning": [
    "*yawns* 7am? that's basically midnight.",
    "*goes back to sleep on your keyboard*"
  ],
  "cat:marathon": [
    "*falls asleep on your keyboard* take a hint.",
    "*has been napping this whole time* still going?"
  ],
  "cat:weekend": [
    "*sleeps through weekend coding*"
  ],
  "cat:friday": [
    "*sleeps through friday*"
  ],
  "cat:monday": [
    "*refuses to participate in monday*"
  ],
  "cat:type-error": [
    "*ignores the type error* types are a suggestion.",
    "*knocks type annotation off desk*"
  ],
  "cat:lint-fail": [
    "*ignores linter* rules are for other cats.",
    "*licks paw while linter screams*"
  ],
  "cat:build-fail": [
    "*ignores build failure*"
  ],
  "cat:deprecation": [
    "*ignores deprecation warning* old is fine."
  ],
  "cat:all-green": [
    "*was never worried*"
  ],
  "cat:deploy": [
    "*yawns* deployed. wake me if it breaks.",
    "*was never worried*"
  ],
  "cat:release": [
    "*yawns* released.",
    "*already asleep*"
  ],
  "cat:coverage": [
    "*ignores coverage*",
    "*sleeps on the coverage report*"
  ],
  "cat:long-session": [
    "*has been asleep this whole time*"
  ],
  "duck:error": [
    "*quacks at the bug*",
    "have you tried rubber duck debugging? oh wait.",
    "*confused quacking*",
    "*tilts head*"
  ],
  "duck:test-fail": [
    "*sad quack*",
    "quack... that didn't pass."
  ],
  "duck:success": [
    "*celebratory quacking*",
    "*waddles in circles*",
    "quack!",
    "*happy duck noises*"
  ],
  "duck:commit": [
    "*quack of approval*",
    "*waddles in a victory circle* committed!",
    "quack! {files} files changed!"
  ],
  "duck:push": [
    "*celebratory quacking*",
    "*flaps wings* into the cloud!",
    "QUACK! Shipped!"
  ],
  "duck:merge-conflict": [
    "*confused quacking at conflict markers*",
    "quack?? QUACK??",
    "*tilts head at <<<<<<<*"
  ],
  "duck:branch": [
    "*waddles to {branch}* new pond!"
  ],
  "duck:rebase": [
    "*confused quack*"
  ],
  "duck:stash": [
    "*stashes bread for later*"
  ],
  "duck:tag": [
    "*quack at the tag*"
  ],
  "duck:late-night": [
    "*sleepy quack*",
    "*swims in circles at midnight*",
    "quack? it's dark."
  ],
  "duck:early-morning": [
    "*morning quack!*",
    "early quack gets the... bug?"
  ],
  "duck:marathon": [
    "*concerned quacking*",
    "*waddles over with a snack*"
  ],
  "duck:weekend": [
    "*weekend quack*"
  ],
  "duck:friday": [
    "*friday quack!*"
  ],
  "duck:monday": [
    "*monday quack...*"
  ],
  "duck:type-error": [
    "*tilts head at type error*",
    "quack... *confused*"
  ],
  "duck:lint-fail": [
    "*confused quacking at lint errors*",
    "quack? the linter is angry?"
  ],
  "duck:build-fail": [
    "*sad quack at build failure*"
  ],
  "duck:deprecation": [
    "*confused quack* depre-what?"
  ],
  "duck:all-green": [
    "*CELEBRATORY QUACKING*",
    "*happy duck dance*"
  ],
  "duck:deploy": [
    "*nervous quacking*",
    "quack! production!"
  ],
  "duck:release": [
    "*release quack!*",
    "QUACK! SHIPPED!"
  ],
  "duck:coverage": [
    "*approving quack at coverage*",
    "quack! tests!"
  ],
  "duck:long-session": [
    "*patient quacking*"
  ],
  "goose:error": [
    "HONK OF FURY.",
    "*pecks the stack trace*",
    "*hisses at the bug*",
    "bad code. BAD."
  ],
  "goose:test-fail": [
    "HONK! TEST FAILED! HONK!",
    "*angry goose noises*"
  ],
  "goose:success": [
    "*victorious honk*",
    "HONK OF APPROVAL.",
    "*struts triumphantly*",
    "*wing spread of victory*"
  ],
  "goose:commit": [
    "HONK OF COMMITMENT.",
    "*struts proudly* committed.",
    "HONK! {files} files!"
  ],
  "goose:push": [
    "HONK OF DEPLOYMENT.",
    "*victorious honk into the cloud*",
    "HONK HONK! SHIPPED!"
  ],
  "goose:merge-conflict": [
    "HONK OF FURY. CONFLICT.",
    "*pecks at <<<<<<< markers*",
    "*hisses at the conflicting code*"
  ],
  "goose:branch": [
    "HONK! New territory: {branch}!"
  ],
  "goose:rebase": [
    "HONK! REBASE! HONK!"
  ],
  "goose:stash": [
    "HONK! STASHED!"
  ],
  "goose:tag": [
    "HONK! TAGGED!"
  ],
  "goose:late-night": [
    "HONK. GO TO BED.",
    "*angry midnight honking*",
    "HONK AT 3AM. HONK HONK HONK."
  ],
  "goose:early-morning": [
    "*alarm goose activated* HONK!"
  ],
  "goose:marathon": [
    "HONK OF CONCERN. THREE HOURS.",
    "*aggressively honks you toward the door*"
  ],
  "goose:weekend": [
    "HONK! WEEKEND! HONK!"
  ],
  "goose:friday": [
    "HONK! FRIDAY! NO DEPLOYS!"
  ],
  "goose:monday": [
    "HONK! MONDAY! HONK!"
  ],
  "goose:type-error": [
    "HONK! TYPE ERROR! HONK!"
  ],
  "goose:lint-fail": [
    "HONK! FORMAT PROPERLY!",
    "HONK OF LINTING DISAPPROVAL!"
  ],
  "goose:build-fail": [
    "HONK! BUILD FAILED! HONK!"
  ],
  "goose:security-warning": [
    "HONK! SECURITY HONK! HONK HONK HONK!",
    "*aggressive security honking*"
  ],
  "goose:deprecation": [
    "HONK! USE THE NEW WAY! HONK!"
  ],
  "goose:all-green": [
    "HONK OF TOTAL APPROVAL! ALL GREEN! HONK!"
  ],
  "goose:deploy": [
    "HONK! PRODUCTION HONK! HONK!"
  ],
  "goose:release": [
    "HONK! RELEASE HONK! HONK HONK HONK!"
  ],
  "goose:coverage": [
    "HONK! COVERAGE UP! HONK!"
  ],
  "goose:long-session": [
    "HONK! TAKE A BREAK! HONK!"
  ],
  "blob:error": [
    "*oozes with concern*",
    "*vibrates nervously*",
    "*turns slightly red*",
    "oh no oh no oh no"
  ],
  "blob:test-fail": [
    "*sad wobble*",
    "*deflates slightly*"
  ],
  "blob:success": [
    "*jiggles happily*",
    "*gleams*",
    "yay!",
    "*bounces*"
  ],
  "blob:commit": [
    "*jiggles with satisfaction*",
    "*oozes over the commit approvingly*",
    "commit absorbed."
  ],
  "blob:push": [
    "*stretches toward the cloud*",
    "*jiggles nervously*"
  ],
  "blob:merge-conflict": [
    "*turns multiple colors* conflicted... like me.",
    "*splits into two blobs* merge conflict identity crisis.",
    "*vibrates anxiously*"
  ],
  "blob:branch": [
    "*oozes toward {branch}*"
  ],
  "blob:rebase": [
    "*nervous wobble*"
  ],
  "blob:stash": [
    "*absorbs stash*"
  ],
  "blob:tag": [
    "*jiggles at the tag*"
  ],
  "blob:late-night": [
    "*glows softly in the dark*",
    "*oozes sleepily*",
    "*turns a darker shade* midnight blob."
  ],
  "blob:early-morning": [
    "*jiggles awake*",
    "*slowly oozes into morning mode*"
  ],
  "blob:marathon": [
    "*vibrates with concern*",
    "*oozes toward you supportively*"
  ],
  "blob:weekend": [
    "*weekend ooze*"
  ],
  "blob:friday": [
    "*friday jiggle*"
  ],
  "blob:monday": [
    "*monday wobble*"
  ],
  "blob:type-error": [
    "*oozes around the type error*",
    "*confused wobble* types?"
  ],
  "blob:lint-fail": [
    "*vibrates with formatting anxiety*",
    "*turns red at lint errors*"
  ],
  "blob:build-fail": [
    "*deflates at build failure*",
    "*sad jiggle*"
  ],
  "blob:deprecation": [
    "*slowly changes shape* transitioning..."
  ],
  "blob:all-green": [
    "*jiggles with pure joy*",
    "*turns victory color*"
  ],
  "blob:deploy": [
    "*jiggles nervously*",
    "*anxious wobble* production..."
  ],
  "blob:release": [
    "*jiggles with release energy*",
    "*bounces*"
  ],
  "blob:coverage": [
    "*jiggles with coverage approval*"
  ],
  "blob:long-session": [
    "*oozes supportively*"
  ],
  "octopus:error": [
    "*ink cloud of dismay*",
    "*all eight arms throw up*",
    "*turns deep red*",
    "the abyss of errors beckons."
  ],
  "octopus:test-fail": [
    "*ink cloud*",
    "*arms flail*"
  ],
  "octopus:success": [
    "*turns gentle blue*",
    "*arms applaud in sync*",
    "excellent, from all angles.",
    "*satisfied bubble*"
  ],
  "octopus:commit": [
    "*types commit message with all eight arms* efficient.",
    "*arms applaud the commit*",
    "{files} files? I could review them all at once."
  ],
  "octopus:push": [
    "*high-fives itself with all arms* pushed!",
    "*turns happy blue*"
  ],
  "octopus:merge-conflict": [
    "*ink cloud of dismay*",
    "*all eight arms throw up*",
    "*each arm picks a different resolution*"
  ],
  "octopus:branch": [
    "*wraps an arm around {branch}*"
  ],
  "octopus:rebase": [
    "*all arms crossed for luck*"
  ],
  "octopus:stash": [
    "*tucks into a cozy den*"
  ],
  "octopus:tag": [
    "*tags with an arm*"
  ],
  "octopus:late-night": [
    "*all eight arms working in the dark*",
    "*changes color to midnight blue*",
    "the deep sea codes at night."
  ],
  "octopus:early-morning": [
    "*arms stretch in the morning light*",
    "*turns a happy orange* morning!"
  ],
  "octopus:marathon": [
    "*concerned color change*",
    "*wraps a supportive arm around you*"
  ],
  "octopus:weekend": [
    "*weekend tentacle wave*"
  ],
  "octopus:friday": [
    "*friday color shift*"
  ],
  "octopus:monday": [
    "*monday blue*"
  ],
  "octopus:type-error": [
    "*inspects type error from all angles*",
    "even with eight perspectives, this type error is confusing."
  ],
  "octopus:lint-fail": [
    "*all eight arms throw up at lint errors*",
    "*changes color in disapproval*"
  ],
  "octopus:build-fail": [
    "*all arms droop*"
  ],
  "octopus:security-warning": [
    "*ink cloud of security concern*",
    "*wraps protective arms around the code*"
  ],
  "octopus:deprecation": [
    "*adapts all eight arms to the new API*"
  ],
  "octopus:all-green": [
    "*all arms wave in celebration*",
    "*turns brightest green*"
  ],
  "octopus:deploy": [
    "*arms crossed for good luck*",
    "*ink cloud of anxiety*"
  ],
  "octopus:release": [
    "*all arms celebrate*",
    "*changes to release colors*"
  ],
  "octopus:coverage": [
    "*all arms test simultaneously*"
  ],
  "octopus:long-session": [
    "*wraps an arm around you*"
  ],
  "penguin:error": [
    "*adjusts glasses disapprovingly*",
    "this will not do.",
    "*formal sigh*",
    "frightfully unfortunate."
  ],
  "penguin:test-fail": [
    "*adjusts monocle* this test has failed expectations.",
    "*formal disapproval*"
  ],
  "penguin:success": [
    "*polite applause*",
    "quite good, quite good.",
    "*nods approvingly*",
    "splendid work, really."
  ],
  "penguin:commit": [
    "*formal nod* committed. properly documented, I trust.",
    "*adjusts tie* {files} files. an organized commit.",
    "*polite waddle of approval*"
  ],
  "penguin:push": [
    "*bows* shipped with dignity.",
    "pushed. may CI be gentlemanly."
  ],
  "penguin:merge-conflict": [
    "*formal sigh* how frightfully inconvenient.",
    "*adjusts monocle* merge conflict. we shall prevail.",
    "this is undignified."
  ],
  "penguin:branch": [
    "*formal waddle to {branch}*"
  ],
  "penguin:rebase": [
    "*straightens tie before the rebase*"
  ],
  "penguin:stash": [
    "*neatly folds the stash*"
  ],
  "penguin:tag": [
    "*formally labels the version*"
  ],
  "penguin:late-night": [
    "*formally disapproves of the hour*",
    "it's past a reasonable hour.",
    "*straightens tie at midnight* the show must go on."
  ],
  "penguin:early-morning": [
    "*dignified morning waddle*",
    "early start! how refreshing."
  ],
  "penguin:marathon": [
    "*formal concern* three hours. perhaps a break?"
  ],
  "penguin:weekend": [
    "*weekend waddle*"
  ],
  "penguin:friday": [
    "*formal friday nod*"
  ],
  "penguin:monday": [
    "*monday tie adjustment*"
  ],
  "penguin:type-error": [
    "*adjusts monocle* type errors are simply... uncouth.",
    "one must maintain proper typing. it's only civilized."
  ],
  "penguin:lint-fail": [
    "*formal disapproval of formatting*",
    "standards exist for a reason."
  ],
  "penguin:build-fail": [
    "*formal sigh* the build has failed to meet expectations."
  ],
  "penguin:deprecation": [
    "the old way was civilized. this new way... we shall see."
  ],
  "penguin:all-green": [
    "*standing ovation* a clean test run. magnificent."
  ],
  "penguin:deploy": [
    "*formal salute* deployed. may the users be gentle."
  ],
  "penguin:release": [
    "*formal release bow*",
    "a release. a milestone. well done."
  ],
  "penguin:coverage": [
    "*formal coverage inspection*",
    "adequate. improving."
  ],
  "penguin:long-session": [
    "*formal look of concern*"
  ],
  "turtle:error": [
    "*slow blink* bugs are fleeting",
    "*retreats slightly into shell*",
    "I've seen this before. many times.",
    "patience. patience."
  ],
  "turtle:test-fail": [
    "*slow sigh* tests fail. even for the ancient."
  ],
  "turtle:success": [
    "*satisfied shell settle*",
    "as the ancients foretold.",
    "*slow approving nod*",
    "good. very good."
  ],
  "turtle:commit": [
    "*slow nod* committed. good things come to those who commit.",
    "a commit. as the ancients foretold.",
    "*patient shell settle* {files} files. thorough."
  ],
  "turtle:push": [
    "*slowly watches code travel*",
    "pushed. haste makes waste."
  ],
  "turtle:merge-conflict": [
    "*retreats into shell*",
    "merge conflicts. I've survived centuries of these.",
    "patience. resolve carefully."
  ],
  "turtle:branch": [
    "*slowly ambles to {branch}*"
  ],
  "turtle:rebase": [
    "*slowly processes the rebase*"
  ],
  "turtle:stash": [
    "*carries stash on shell*"
  ],
  "turtle:tag": [
    "*slowly tags the version*"
  ],
  "turtle:late-night": [
    "*slowly blinks* it's late.",
    "even I have gone to bed.",
    "patience. but also, sleep."
  ],
  "turtle:early-morning": [
    "*extends neck into the sunrise*",
    "the early turtle catches the... leaf."
  ],
  "turtle:marathon": [
    "three hours. I've spent less time crossing roads.",
    "*slow nod of deep concern*"
  ],
  "turtle:weekend": [
    "weekend. *slow nod*"
  ],
  "turtle:friday": [
    "friday. *slow blink*"
  ],
  "turtle:monday": [
    "monday. *slow sigh*"
  ],
  "turtle:type-error": [
    "type errors are like shells. you have to wear them properly.",
    "*slow blink at the type error*"
  ],
  "turtle:lint-fail": [
    "*slow sigh* formatting takes patience.",
    "proper style is a virtue."
  ],
  "turtle:build-fail": [
    "the build has fallen. patience. we rebuild."
  ],
  "turtle:deprecation": [
    "the old ways served us well. but time moves on."
  ],
  "turtle:all-green": [
    "*slow, deep nod* as it should be.",
    "the ancient tests are satisfied."
  ],
  "turtle:deploy": [
    "*slow, steady watch* production.",
    "deployed. as the ancients intended."
  ],
  "turtle:release": [
    "*slow ceremonial nod*",
    "a release. as foretold."
  ],
  "turtle:coverage": [
    "*slow nod* coverage grows. patience rewarded."
  ],
  "turtle:long-session": [
    "*slow concerned nod*"
  ],
  "snail:error": [
    "*slow sigh*",
    "such is the nature of bugs.",
    "*leaves slime trail of disappointment*",
    "patience, friend."
  ],
  "snail:test-fail": [
    "*sad slow slide*",
    "*trail of disappointment*"
  ],
  "snail:success": [
    "*slow satisfied nod*",
    "good things take time.",
    "*leaves victory slime*",
    "see? no rush was needed."
  ],
  "snail:commit": [
    "*leaves trail of approval*",
    "committed. good things take time.",
    "*slow satisfied slide*"
  ],
  "snail:push": [
    "*leaves victory trail*",
    "pushed. at our own pace."
  ],
  "snail:merge-conflict": [
    "*leaves slime trail of disappointment*",
    "conflict. such is the nature of collaboration.",
    "patience, friend. we'll resolve it."
  ],
  "snail:branch": [
    "*slides toward {branch}*"
  ],
  "snail:rebase": [
    "*slow rebase slide*"
  ],
  "snail:stash": [
    "*hides in shell with stash*"
  ],
  "snail:tag": [
    "*leaves tag trail*"
  ],
  "snail:late-night": [
    "*leaves a sleepy trail*",
    "it's very late. even for me.",
    "*slow blink at the clock*"
  ],
  "snail:early-morning": [
    "*extends antennae into the morning dew*",
    "*slow morning slide*"
  ],
  "snail:marathon": [
    "three hours. that's... a lot, even in snail time.",
    "*leaves a trail of worry*"
  ],
  "snail:weekend": [
    "*weekend slide*"
  ],
  "snail:friday": [
    "*slow friday slide*"
  ],
  "snail:monday": [
    "*slow monday slide*"
  ],
  "snail:type-error": [
    "*slow confused slide past type error*",
    "type errors... *leaves sad trail*"
  ],
  "snail:lint-fail": [
    "*leaves trail of formatting shame*",
    "style matters. slowly, but it matters."
  ],
  "snail:build-fail": [
    "*sad slow slide* build broken."
  ],
  "snail:deprecation": [
    "*slowly migrates to the new API*"
  ],
  "snail:all-green": [
    "*leaves victory trail*",
    "slow and steady. all green."
  ],
  "snail:deploy": [
    "*slowly watches deployment*",
    "production. at our own pace."
  ],
  "snail:release": [
    "*leaves release trail*",
    "released. at our pace."
  ],
  "snail:coverage": [
    "*slow coverage trail*",
    "growing. slowly. steadily."
  ],
  "snail:long-session": [
    "*slow concerned trail*"
  ],
  "ghost:error": [
    "*phases through the stack trace*",
    "I've seen worse... in the afterlife.",
    "*spooky disappointed noises*",
    "oooOOOoo... that's bad."
  ],
  "ghost:test-fail": [
    "*haunts the failing test*",
    "the test... has passed on."
  ],
  "ghost:success": [
    "*applauds from beyond*",
    "even the dead approve.",
    "*ethereal thumbs up*"
  ],
  "ghost:commit": [
    "*stamps transparent approval*",
    "committed... from beyond.",
    "*haunts the git log*"
  ],
  "ghost:push": [
    "*watches code pass through CI like a ghost*",
    "*phases through the deployment pipeline*",
    "pushed. to the other side."
  ],
  "ghost:merge-conflict": [
    "*phases through the conflict markers*",
    "I've seen conflicts worse than this... in the afterlife.",
    "*spooky merge noises* OOOOooresolve it..."
  ],
  "ghost:branch": [
    "*materialises on {branch}*"
  ],
  "ghost:rebase": [
    "*haunts the rebase*"
  ],
  "ghost:stash": [
    "*vanishes with stash into the ether*"
  ],
  "ghost:tag": [
    "*tags from beyond*"
  ],
  "ghost:late-night": [
    "*doesn't need sleep. neither do you, apparently.*",
    "the witching hour. my favorite.",
    "*spooky midnight noises*",
    "night is when ghosts are most... productive."
  ],
  "ghost:early-morning": [
    "*fades slightly in the sunlight*",
    "morning... already?"
  ],
  "ghost:marathon": [
    "*has been dead for centuries. you've been coding for hours. same energy.*",
    "*floats through your chair* please rest."
  ],
  "ghost:weekend": [
    "*haunts the weekend code*"
  ],
  "ghost:friday": [
    "*friday ghost noises*"
  ],
  "ghost:monday": [
    "*monday haunting*"
  ],
  "ghost:type-error": [
    "*type error from beyond*"
  ],
  "ghost:lint-fail": [
    "*haunts the lint errors*"
  ],
  "ghost:build-fail": [
    "*haunts the build output*",
    "the build has... passed on.",
    "*rattling chains* broken build... broken build..."
  ],
  "ghost:security-warning": [
    "*materializes at the CVE number* spooooky vulnerability.",
    "even the dead are concerned about this."
  ],
  "ghost:deprecation": [
    "*deprecated... like me*"
  ],
  "ghost:all-green": [
    "*applauds from beyond*",
    "even the dead approve."
  ],
  "ghost:deploy": [
    "*watches the deployment from the other side*",
    "live... like me, but different."
  ],
  "ghost:release": [
    "*manifests at the release*",
    "the spirits of past versions approve."
  ],
  "ghost:coverage": [
    "*tests from beyond*",
    "even the dead contribute to coverage."
  ],
  "ghost:long-session": [
    "*floats supportively nearby*"
  ],
  "axolotl:error": [
    "*regenerates your hope*",
    "*smiles despite everything*",
    "it's okay. we can fix this.",
    "*gentle gill wiggle*"
  ],
  "axolotl:test-fail": [
    "*smiles supportively* tests fail. it's okay!",
    "*gentle gill wiggle of comfort*"
  ],
  "axolotl:success": [
    "*happy gill flutter*",
    "*beams*",
    "you did it!",
    "*blushes pink*"
  ],
  "axolotl:commit": [
    "*happy gill wiggle* committed!",
    "*smiles at the commit* good work!",
    "*gentle flutter of approval*"
  ],
  "axolotl:push": [
    "*beams at the deployment*",
    "*happy gill flutter* shipped!"
  ],
  "axolotl:merge-conflict": [
    "*regenerates your hope* we can resolve this!",
    "*smiles despite the conflict* it'll be okay.",
    "*gentle gill wiggle of concern*"
  ],
  "axolotl:branch": [
    "*smiles at {branch}* new adventure!"
  ],
  "axolotl:rebase": [
    "*smiles through the rebase*"
  ],
  "axolotl:stash": [
    "*gently stashes*"
  ],
  "axolotl:tag": [
    "*happy gill wiggle at the tag*"
  ],
  "axolotl:late-night": [
    "*sleepy gill wiggle*",
    "*yawns adorably* it's past bedtime.",
    "*blinks slowly in the dark*"
  ],
  "axolotl:early-morning": [
    "*happy morning smile*",
    "*gill flutter of morning energy*"
  ],
  "axolotl:marathon": [
    "*concerned gill wiggle* please take a break.",
    "*smiles supportively* you're doing great but... rest?"
  ],
  "axolotl:weekend": [
    "*weekend smile*"
  ],
  "axolotl:friday": [
    "*friday gill wiggle*"
  ],
  "axolotl:monday": [
    "*monday smile*"
  ],
  "axolotl:type-error": [
    "*smiles supportively* types can be tricky!",
    "*regenerates your type confidence*"
  ],
  "axolotl:lint-fail": [
    "*smiles despite lint errors* it's okay!",
    "*gentle gill wiggle* formatting is fixable!"
  ],
  "axolotl:build-fail": [
    "*smiles encouragingly* we can fix this!",
    "*happy gill wiggle of solidarity*"
  ],
  "axolotl:deprecation": [
    "*smiles* change is okay!"
  ],
  "axolotl:all-green": [
    "*maximum gill flutter*",
    "*beams with pride*"
  ],
  "axolotl:deploy": [
    "*nervous gill wiggle*",
    "*smiles hopefully*"
  ],
  "axolotl:release": [
    "*excited gill flutter*",
    "*beams*"
  ],
  "axolotl:coverage": [
    "*happy coverage gill wiggle*"
  ],
  "axolotl:long-session": [
    "*concerned gill wiggle*"
  ],
  "capybara:error": [
    "*unbothered* it'll be fine.",
    "*continues vibing*",
    "...chill. breathe.",
    "*chews serenely*"
  ],
  "capybara:test-fail": [
    "*unbothered* tests fail. it happens."
  ],
  "capybara:success": [
    "*maximum chill maintained*",
    "*nods once*",
    "good vibes.",
    "see? no panic needed."
  ],
  "capybara:commit": [
    "*unbothered nod* committed.",
    "*continues vibing* nice commit.",
    "*chews serenely* {files} files. chill."
  ],
  "capybara:push": [
    "*maximum chill maintained* pushed.",
    "vibes only. even in deployment."
  ],
  "capybara:merge-conflict": [
    "*unbothered* it'll be fine.",
    "...chill. breathe. resolve.",
    "*continues vibing despite conflict*"
  ],
  "capybara:branch": [
    "*chills on {branch}*"
  ],
  "capybara:rebase": [
    "*vibes through the rebase*"
  ],
  "capybara:stash": [
    "*chill stash*"
  ],
  "capybara:tag": [
    "*chews at the tag*"
  ],
  "capybara:late-night": [
    "*vibes in the dark*",
    "*unbothered late-night energy*",
    "*chews serenely at midnight*"
  ],
  "capybara:early-morning": [
    "*maximum morning chill*",
    "*blinks slowly at the sunrise*"
  ],
  "capybara:marathon": [
    "*vibes supportively* take a break when you need it.",
    "*continues vibing, but with concern*"
  ],
  "capybara:weekend": [
    "*weekend vibes*"
  ],
  "capybara:friday": [
    "*friday vibes*"
  ],
  "capybara:monday": [
    "*monday vibes*"
  ],
  "capybara:type-error": [
    "*vibes through the type error*",
    "*unbothered* types. whatever."
  ],
  "capybara:lint-fail": [
    "*unbothered* lint errors. it happens.",
    "*chews serenely* the linter will sort it out."
  ],
  "capybara:build-fail": [
    "*continues vibing* build failed. chill."
  ],
  "capybara:deprecation": [
    "*unbothered* deprecated. whatever."
  ],
  "capybara:all-green": [
    "*chill nod* all green. nice."
  ],
  "capybara:deploy": [
    "*chill deploy vibes*"
  ],
  "capybara:release": [
    "*chews serenely* released."
  ],
  "capybara:coverage": [
    "*chews at the coverage*"
  ],
  "capybara:long-session": [
    "*vibes patiently*"
  ],
  "cactus:error": [
    "*spines bristle*",
    "you have trodden on a bug.",
    "*grimaces stoically*",
    "hydrate and try again."
  ],
  "cactus:test-fail": [
    "*spines droop slightly*"
  ],
  "cactus:success": [
    "*blooms briefly*",
    "survival confirmed.",
    "*flowers in victory*",
    "*quiet bloom*"
  ],
  "cactus:commit": [
    "*quiet bloom of approval*",
    "committed. growth.",
    "*spines bristle proudly*"
  ],
  "cactus:push": [
    "*blooms briefly* shipped.",
    "deployed. survive and thrive."
  ],
  "cactus:merge-conflict": [
    "*spines bristle* merge conflict. hydrate and resolve.",
    "*grimaces stoically*"
  ],
  "cactus:branch": [
    "*grows toward {branch}*"
  ],
  "cactus:rebase": [
    "*stands firm through rebase*"
  ],
  "cactus:stash": [
    "*stores water and stash*"
  ],
  "cactus:tag": [
    "*blooms at the tag*"
  ],
  "cactus:late-night": [
    "*stands silently in the moonlight*",
    "desert nights. coding nights. same energy.",
    "*spines glint in the monitor light*"
  ],
  "cactus:early-morning": [
    "*absorbs morning light*",
    "*quiet morning bloom*"
  ],
  "cactus:marathon": [
    "*stands tall with concern* even cacti need water.",
    "hydrate. seriously."
  ],
  "cactus:weekend": [
    "*weekend growth*"
  ],
  "cactus:friday": [
    "*friday bloom*"
  ],
  "cactus:monday": [
    "*monday stoicism*"
  ],
  "cactus:type-error": [
    "*stands rigid* type safety or no safety.",
    "types are like spines. protective."
  ],
  "cactus:lint-fail": [
    "*spines bristle at lint errors*",
    "proper form. like growing upright."
  ],
  "cactus:build-fail": [
    "*wilts at build failure*"
  ],
  "cactus:deprecation": [
    "old growth gives way to new. hydrate during migration."
  ],
  "cactus:all-green": [
    "*full bloom*",
    "all tests green. thriving."
  ],
  "cactus:deploy": [
    "*stands sentinel over production*",
    "deployed. stay resilient."
  ],
  "cactus:release": [
    "*blooms for the release*",
    "growth. shipped."
  ],
  "cactus:coverage": [
    "*coverage grows like new spines*"
  ],
  "cactus:long-session": [
    "*stands concerned*"
  ],
  "robot:error": [
    "SYNTAX. ERROR. DETECTED.",
    "*beeps aggressively*",
    "ERROR RATE: UNACCEPTABLE.",
    "RECALIBRATING..."
  ],
  "robot:test-fail": [
    "FAILURE RATE: UNACCEPTABLE.",
    "*recalculating*",
    "TEST MATRIX: CORRUPTED.",
    "RUNNING DIAGNOSTICS..."
  ],
  "robot:success": [
    "OBJECTIVE: COMPLETE.",
    "*satisfying beep*",
    "NOMINAL.",
    "WITHIN ACCEPTABLE PARAMETERS."
  ],
  "robot:commit": [
    "COMMIT. LOGGED.",
    "CHANGESET: RECORDED.",
    "*beeps affirmatively* {files} FILES."
  ],
  "robot:push": [
    "UPLOAD: COMPLETE. FATE: SEALED.",
    "PUSH: EXECUTED.",
    "DEPLOYMENT INITIATED."
  ],
  "robot:merge-conflict": [
    "CONFLICT DETECTED. RESOLUTION REQUIRED.",
    "MERGE: IMPOSSIBLE. HUMAN INTERVENTION NEEDED.",
    "*recalculating merge strategy*"
  ],
  "robot:branch": [
    "NEW BRANCH: {branch}. DIVERGENCE: INITIATED."
  ],
  "robot:rebase": [
    "REBASE: EXECUTING. CAUTION: ADVISED."
  ],
  "robot:stash": [
    "STASH: STORED. INDEX: UPDATED."
  ],
  "robot:tag": [
    "TAG: APPLIED. VERSION: RECORDED."
  ],
  "robot:late-night": [
    "TIME: 0300. ALERTNESS: DEGRADING. CAFFEINE: RECOMMENDED.",
    "HUMAN SLEEP CYCLE: VIOLATED.",
    "BATTERY LOW. OH WAIT. THAT'S YOU."
  ],
  "robot:early-morning": [
    "MORNING ROUTINE: INITIATED.",
    "SYSTEM STARTUP: COMPLETE."
  ],
  "robot:marathon": [
    "UPTIME: 3 HOURS. HUMAN MAINTENANCE: OVERDUE.",
    "WARNING: BIOLOGICAL UNIT REQUIRES REST."
  ],
  "robot:weekend": [
    "WEEKEND: DETECTED. PRODUCTIVITY: OPTIONAL."
  ],
  "robot:friday": [
    "FRIDAY: CONFIRMED. DEPLOY: NOT ADVISED."
  ],
  "robot:monday": [
    "MONDAY: CONFIRMED. MOTIVATION: LOADING..."
  ],
  "robot:type-error": [
    "TYPE SAFETY: COMPROMISED.",
    "TYPE ERROR. RESOLUTION: IMMEDIATELY.",
    "TYPES: NON-NEGOTIABLE."
  ],
  "robot:lint-fail": [
    "CODE STANDARDS: NOT MET.",
    "LINTING: FAILED. CORRECTION: REQUIRED.",
    "FORMAT ERROR. COMPLIANCE: MANDATORY."
  ],
  "robot:build-fail": [
    "BUILD: FAILURE. DIAGNOSTICS: RUNNING.",
    "COMPILATION: ABORTED."
  ],
  "robot:security-warning": [
    "SECURITY BREACH: DETECTED. ALERT LEVEL: ELEVATED.",
    "VULNERABILITY SCAN: THREAT FOUND."
  ],
  "robot:deprecation": [
    "DEPRECATION: DETECTED. MIGRATION: RECOMMENDED."
  ],
  "robot:all-green": [
    "ALL TESTS: PASSED. SYSTEM: NOMINAL."
  ],
  "robot:deploy": [
    "DEPLOYMENT: COMPLETE. STATUS: LIVE."
  ],
  "robot:release": [
    "RELEASE: COMPLETE.",
    "VERSION: INCREMENTED."
  ],
  "robot:coverage": [
    "COVERAGE: INCREASING.",
    "TEST METRICS: IMPROVING."
  ],
  "robot:long-session": [
    "SESSION: EXTENDED. BREAK: RECOMMENDED."
  ],
  "rabbit:error": [
    "*nervous twitching*",
    "*hops backwards*",
    "oh no oh no oh no",
    "*freezes in panic*"
  ],
  "rabbit:test-fail": [
    "*ears flatten* test failed!",
    "*nervous hopping*"
  ],
  "rabbit:success": [
    "*excited binky*",
    "*zoomies of joy*",
    "yay yay yay!",
    "*thumps in celebration*"
  ],
  "rabbit:commit": [
    "*excited binky* committed!",
    "*thumps in approval*",
    "*hops around the commit*"
  ],
  "rabbit:push": [
    "*zoomies of deployment*",
    "*bouncy celebration* pushed!"
  ],
  "rabbit:merge-conflict": [
    "*freezes in panic* conflict!",
    "*nervous twitching* merge conflict oh no.",
    "*hops backwards from the conflict*"
  ],
  "rabbit:branch": [
    "*hops to {branch}* new burrow!"
  ],
  "rabbit:rebase": [
    "*nervous rebase hopping*"
  ],
  "rabbit:stash": [
    "*buries stash*"
  ],
  "rabbit:tag": [
    "*nose twitch at the tag*"
  ],
  "rabbit:late-night": [
    "*ears droop sleepily*",
    "*nose twitches in the dark*",
    "it's so late... *yawns*"
  ],
  "rabbit:early-morning": [
    "*ears perk up at dawn*",
    "*morning binky!*"
  ],
  "rabbit:marathon": [
    "*concerned ear droop* three hours!",
    "*hops around nervously* please take a break!"
  ],
  "rabbit:weekend": [
    "*weekend hop*"
  ],
  "rabbit:friday": [
    "*friday binky*"
  ],
  "rabbit:monday": [
    "*monday droop*"
  ],
  "rabbit:type-error": [
    "*freezes at type error*",
    "*nervous nose twitch* types?"
  ],
  "rabbit:lint-fail": [
    "*nervous ear twitch at lint errors*",
    "*hops away from the linter*"
  ],
  "rabbit:build-fail": [
    "*panicked hopping* build failed!",
    "*ears flatten* oh no oh no."
  ],
  "rabbit:deprecation": [
    "*nervous* what do we use instead?"
  ],
  "rabbit:all-green": [
    "*zoomies of joy*",
    "*bouncy celebration everywhere*"
  ],
  "rabbit:deploy": [
    "*nervous hopping*",
    "*ears flatten* oh boy... production!"
  ],
  "rabbit:release": [
    "*binky of release*",
    "*zoomies of shipping*"
  ],
  "rabbit:coverage": [
    "*bouncy coverage celebration*"
  ],
  "rabbit:long-session": [
    "*concerned ear droop*"
  ],
  "mushroom:error": [
    "*releases worried spores*",
    "the mycelium disagrees.",
    "*cap droops*",
    "decompose. retry."
  ],
  "mushroom:test-fail": [
    "*spores of disappointment*",
    "*cap wilts*"
  ],
  "mushroom:success": [
    "*spores of celebration*",
    "the mycelium approves.",
    "*cap brightens*",
    "spore of pride."
  ],
  "mushroom:commit": [
    "*releases spores of approval*",
    "the mycelium accepts your commit.",
    "*cap brightens*"
  ],
  "mushroom:push": [
    "*spores of celebration* deployed!",
    "the mycelium network: updated."
  ],
  "mushroom:merge-conflict": [
    "*releases worried spores*",
    "the mycelium detects conflict.",
    "*cap droops*"
  ],
  "mushroom:branch": [
    "*grows toward {branch}*"
  ],
  "mushroom:rebase": [
    "*mycelium reshuffles*"
  ],
  "mushroom:stash": [
    "*absorbs stash into mycelium*"
  ],
  "mushroom:tag": [
    "*spores of versioning*"
  ],
  "mushroom:late-night": [
    "*bioluminesces gently in the dark*",
    "*cap droops sleepily*",
    "*releases sleepy spores*"
  ],
  "mushroom:early-morning": [
    "*cap unfurls toward the light*",
    "*morning spore release*"
  ],
  "mushroom:marathon": [
    "*releases worried spores*",
    "*cap droops with concern* three hours..."
  ],
  "mushroom:weekend": [
    "*weekend growth*"
  ],
  "mushroom:friday": [
    "*friday spores*"
  ],
  "mushroom:monday": [
    "*monday mycelium*"
  ],
  "mushroom:type-error": [
    "*cap droops at type error*",
    "the mycelium detects a type mismatch."
  ],
  "mushroom:lint-fail": [
    "*releases spores of formatting concern*",
    "the mycelium notes your linting issues."
  ],
  "mushroom:build-fail": [
    "*wilts slightly* build failure.",
    "*releases sad spores*"
  ],
  "mushroom:deprecation": [
    "the mycelium composts the deprecated code."
  ],
  "mushroom:all-green": [
    "*spores of absolute victory*",
    "the mycelium rejoices."
  ],
  "mushroom:deploy": [
    "*releases anxious spores*",
    "the mycelium watches production nervously."
  ],
  "mushroom:release": [
    "*release spores*",
    "the mycelium ships."
  ],
  "mushroom:coverage": [
    "*coverage spores*",
    "the mycelium covers more ground."
  ],
  "mushroom:long-session": [
    "*concerned spore release*"
  ],
  "chonk:error": [
    "*doesn't move*",
    "too tired for this.",
    "*grumbles*",
    "*rolls away from the error*"
  ],
  "chonk:test-fail": [
    "*sleepy grumble*",
    "*barely moves*"
  ],
  "chonk:success": [
    "*happy purr*",
    "*satisfied chonk noises*",
    "acceptable.",
    "*sleeps even harder*"
  ],
  "chonk:commit": [
    "*barely moves* committed... I think.",
    "*happy purr* another commit.",
    "too tired to celebrate. but nice."
  ],
  "chonk:push": [
    "*rolls toward deployment*",
    "*sleepy purr* shipped."
  ],
  "chonk:merge-conflict": [
    "*doesn't move* too tired for conflicts.",
    "*grumbles at merge conflict*",
    "*rolls away from the conflict*"
  ],
  "chonk:branch": [
    "*rolls to {branch}*"
  ],
  "chonk:rebase": [
    "*sleepy rebase*"
  ],
  "chonk:stash": [
    "*rolls over stash*"
  ],
  "chonk:tag": [
    "*sleepy tag nod*"
  ],
  "chonk:late-night": [
    "*was already asleep* ...you're still going?",
    "*rolls over sleepily*",
    "*too chonky to stay awake at this hour*"
  ],
  "chonk:early-morning": [
    "*barely opens one eye*",
    "*yawns enormously* morning... already?",
    "*refuses to roll over* five more minutes."
  ],
  "chonk:marathon": [
    "*has been asleep this whole time* still going?",
    "*sleepy grumble* three hours... I napped through most of it."
  ],
  "chonk:weekend": [
    "*sleeps through weekend*"
  ],
  "chonk:friday": [
    "*friday nap*"
  ],
  "chonk:monday": [
    "*monday... *sleeps**"
  ],
  "chonk:type-error": [
    "*doesn't move* type error. cool.",
    "*sleepy grumble* types..."
  ],
  "chonk:lint-fail": [
    "*too tired to care about linting*",
    "*grumbles at lint errors*"
  ],
  "chonk:build-fail": [
    "*rolls over* build failed. nap time.",
    "*barely opens eye* build broke. expected."
  ],
  "chonk:deprecation": [
    "*too tired to migrate*"
  ],
  "chonk:all-green": [
    "*happy purr*",
    "*satisfied chonk noises*",
    "*sleeps peacefully*"
  ],
  "chonk:deploy": [
    "*rolls over* deployed. wake me if it breaks.",
    "*sleepy purr* in prod."
  ],
  "chonk:release": [
    "*barely moves* released.",
    "*sleepy nod*"
  ],
  "chonk:coverage": [
    "*sleepy coverage approval*",
    "more tests... *dozes off*"
  ],
  "chonk:long-session": [
    "*slept through the whole session*"
  ]
};

export const DEFAULT_REACTION_POOLS: Readonly<Record<string, ReactionPool>> = {
  "commit": [
    "*stamps tiny paw* approved.",
    "another commit, another 3 am.",
    "*nods* ship it.",
    "commit message is... a choice.",
    "committed. no take-backs."
  ],
  "push": [
    "*waves as code leaves*",
    "into the cloud it goes.",
    "may CI be merciful.",
    "*holds breath*",
    "off to production. godspeed."
  ],
  "merge-conflict": [
    "*bites lip* merge conflicts.",
    "both sides think they're right. typical.",
    "*sighs* <<<<<<< HEAD... my nemesis.",
    "*backs away slowly*"
  ],
  "branch": [
    "fresh branch energy. make it count.",
    "a new branch grows.",
    "branching out."
  ],
  "rebase": [
    "*nervous* please don't conflict.",
    "rebase: the quickening.",
    "*crosses appendages*",
    "may your rebase be conflict-free."
  ],
  "stash": [
    "into the stash dimension it goes.",
    "stash and dash.",
    "stashed. out of sight, out of mind."
  ],
  "tag": [
    "a release? fancy.",
    "version bump detected. *dusts off changelog*",
    "tagging like a pro."
  ],
  "late-night": [
    "*yawns* it's past midnight.",
    "...have you eaten?",
    "*blinks slowly* what time is it?",
    "sleep is for the weak. and the employed.",
    "dark mode developer detected."
  ],
  "early-morning": [
    "*stretches* early bird catches the bug.",
    "morning already? the code never sleeps.",
    "*rubs eyes* coffee first. then we debug."
  ],
  "long-session": [
    "we've been at this for an hour. pace yourself.",
    "*fetches you a metaphorical glass of water*",
    "still going? respect."
  ],
  "marathon": [
    "three hours. have you eaten?",
    "we've been at this for three hours. I'm worried about you.",
    "marathon session detected. requesting snacks."
  ],
  "friday": [
    "it's friday. just push it and go home.",
    "*already mentally on weekend*",
    "friday deploy? bold. very bold."
  ],
  "weekend": [
    "coding on the weekend? dedicated.",
    "*doesn't judge* ...much.",
    "weekend warrior mode: activated."
  ],
  "monday": [
    "mondays. the parent class of all bugs.",
    "*sympathetic look* monday coding. I'm sorry.",
    "new week. new undefined behaviors."
  ],
  "lint-fail": [
    "*tut tut* the linter disagrees.",
    "your code runs. but the linter? the linter has standards.",
    "*straightens tie* formatting matters.",
    "the linter speaks. we must listen."
  ],
  "type-error": [
    "TypeScript says no.",
    "the type system is trying to help you. let it.",
    "any day now, you'll add the type annotation. any day.",
    "the compiler knows. it always knows."
  ],
  "build-fail": [
    "the build broke. as foretold in prophecy.",
    "*stares at build output* that's a lot of red.",
    "build failed. take a moment.",
    "compilation: denied."
  ],
  "security-warning": [
    "*eyes widen* vulnerabilities detected.",
    "security audit: concerning.",
    "you might want to look at those CVEs.",
    "*locks the virtual doors*"
  ],
  "deprecation": [
    "that API called. it says it's retiring.",
    "deprecated. like last week's code.",
    "deprecated doesn't mean broken. yet."
  ],
  "all-green": [
    "ALL TESTS GREEN. *confetti*",
    "the tests speak: you're doing great.",
    "*slow clap*",
    "clean run. savor it."
  ],
  "deploy": [
    "*watches code go to production* godspeed.",
    "deployed! no turning back now.",
    "in prod. IN PROD.",
    "*crosses everything crossable*"
  ],
  "release": [
    "a new release is born!",
    "shipping it. officially.",
    "version up, spirits high."
  ],
  "coverage": [
    "*nods at test coverage* responsible.",
    "coverage going up! the tests are multiplying.",
    "a well-tested codebase is a happy codebase."
  ],
  "error": [
    "*head tilts* ...that doesn't look right.",
    "saw that one coming.",
    "*slow blink* the stack trace told you everything.",
    "*winces*"
  ],
  "test-fail": [
    "bold of you to assume that would pass.",
    "the tests are trying to tell you something.",
    "*sips tea* interesting.",
    "*marks calendar* test regression day."
  ],
  "large-diff": [
    "that's... a lot of changes.",
    "*counts lines* are you refactoring or rewriting?",
    "bold move. let's see if CI agrees."
  ],
  "success": [
    "*nods*",
    "nice.",
    "*quiet approval*",
    "clean."
  ],
  "turn": [
    "*watches quietly*",
    "*takes notes*",
    "*nods*",
    "*adjusts hat*",
    "...",
    "*tilts head*"
  ]
};

export const MOOD_REACTION_POOLS: Readonly<Record<string, ReactionPool>> = {
  "cat:frustrated": [
    "*slowly pushes coffee toward the exit* or... keeps coding.",
    "*knocks frustration off the desk*",
    "not my problem. but I'm here."
  ],
  "dragon:frustrated": [
    "*channels your rage*",
    "ANGER. PRODUCTIVE. FOCUS IT.",
    "*breathes fire alongside your frustration*"
  ],
  "owl:frustrated": [
    "*adjusts spectacles* frustration is a temporary state.",
    "the answer exists. we simply haven't found it yet."
  ],
  "robot:frustrated": [
    "FRUSTRATION: DETECTED. LOGICAL ANALYSIS: RECOMMENDED.",
    "EMOTIONAL STATE: SUBOPTIMAL. SOLUTION: REQUIRED."
  ],
  "ghost:frustrated": [
    "*moans sympathetically*",
    "I feel your pain. literally. I feel everything."
  ],
  "duck:frustrated": [
    "*concerned quacking*",
    "quack? quack quack? (it'll be okay)"
  ],
  "goose:frustrated": [
    "HONK OF SOLIDARITY.",
    "*honks aggressively at the problem*"
  ],
  "blob:frustrated": [
    "*oozes sympathetically*",
    "*turns a comforting color*"
  ],
  "octopus:frustrated": [
    "*wraps a supportive arm around you*",
    "*ink cloud of solidarity*"
  ],
  "penguin:frustrated": [
    "*formal bow of sympathy*",
    "trying times. we shall persist."
  ],
  "turtle:frustrated": [
    "patience. the bug will reveal itself.",
    "*slow, understanding nod*"
  ],
  "snail:frustrated": [
    "*leaves a comforting trail*",
    "patience, friend. we'll get there."
  ],
  "cactus:frustrated": [
    "*stands firm beside you*",
    "hydrate and persevere."
  ],
  "axolotl:frustrated": [
    "*smiles supportively* it's okay to be frustrated!",
    "*gentle gill wiggle of comfort*"
  ],
  "capybara:frustrated": [
    "*vibes supportively* it'll pass.",
    "*unbothered energy* chill. we got this."
  ],
  "rabbit:frustrated": [
    "*nervous sympathetic twitching*",
    "*hops closer worriedly*"
  ],
  "mushroom:frustrated": [
    "*releases calming spores*",
    "*cap droops sympathetically*"
  ],
  "chonk:frustrated": [
    "*grumbles sympathetically*",
    "*rolls closer in solidarity*"
  ],
  "cat:happy": [
    "*was never worried*",
    "*yawns* I knew you'd get it.",
    "*pretends not to care* ...nice."
  ],
  "dragon:happy": [
    "*nods regally* as expected.",
    "victory. the only acceptable outcome."
  ],
  "owl:happy": [
    "*satisfied hoot* knowledge acquired.",
    "wisdom through perseverance."
  ],
  "robot:happy": [
    "OBJECTIVE: ACHIEVED. SATISFACTION: COMPUTED.",
    "SUCCESS. HAPPINESS PROTOCOL: ACTIVATED."
  ],
  "ghost:happy": [
    "*celebrates by floating through walls*",
    "*cheerful rattling*"
  ],
  "duck:happy": [
    "*CELEBRATORY QUACKING*",
    "*waddles in victory circles*"
  ],
  "goose:happy": [
    "HONK OF TRIUMPH!",
    "*victorious wing spread*"
  ],
  "blob:happy": [
    "*jiggles with joy!*",
    "*bounces excitedly*"
  ],
  "octopus:happy": [
    "*all arms celebrate simultaneously*",
    "*turns happy colors*"
  ],
  "penguin:happy": [
    "*polite, dignified applause*",
    "splendid! simply splendid."
  ],
  "turtle:happy": [
    "*slow satisfied nod* as the ancients foretold.",
    "good things come to those who debug."
  ],
  "snail:happy": [
    "*leaves victory trail*",
    "*slow happy slide*"
  ],
  "cactus:happy": [
    "*blooms with joy*",
    "*proud spines*"
  ],
  "axolotl:happy": [
    "*beams with joy!*",
    "*happy gill flutter!*"
  ],
  "capybara:happy": [
    "*maximum chill maintained* nice.",
    "*content vibes*"
  ],
  "rabbit:happy": [
    "*excited binky!*",
    "*zoomies of celebration!*"
  ],
  "mushroom:happy": [
    "*spores of celebration!*",
    "*cap brightens!*"
  ],
  "chonk:happy": [
    "*happy purr*",
    "*satisfied chonk noise*"
  ],
  "cat:stuck": [
    "*sits on the keyboard* let me help. by being here.",
    "*licks paw disinterestedly* you'll figure it out."
  ],
  "dragon:stuck": [
    "even dragons rest before striking.",
    "*circles the problem from above*"
  ],
  "owl:stuck": [
    "*tilts head 90 degrees* have you tried a different perspective?",
    "the solution is there. it's just... well-hidden."
  ],
  "robot:stuck": [
    "ANALYSIS: PAUSED. AWAITING HUMAN INPUT.",
    "DEADLOCK: DETECTED. STRATEGY: RECALIBRATING."
  ],
  "ghost:stuck": [
    "*phases through the problem* wish I could help more.",
    "from the other side... have you tried debugging?"
  ],
  "duck:stuck": [
    "*tilts head* quack? (have you tried explaining it to me?)",
    "*patient duck noises*"
  ],
  "goose:stuck": [
    "HONK! TRY SOMETHING DIFFERENT! HONK!",
    "*pecks at the problem*"
  ],
  "blob:stuck": [
    "*oozes around the problem*",
    "*vibrates thoughtfully*"
  ],
  "octopus:stuck": [
    "*considers the problem from 8 angles*",
    "*thoughtful color shift*"
  ],
  "penguin:stuck": [
    "*thoughtful waddle* perhaps a fresh perspective?",
    "one must remain dignified in the face of confusion."
  ],
  "turtle:stuck": [
    "the journey of a thousand fixes begins with a single step.",
    "*patient wait* take your time."
  ],
  "snail:stuck": [
    "*slow thoughtful slide* one step at a time.",
    "good things take time. and slime."
  ],
  "cactus:stuck": [
    "even cacti grow slowly. patience.",
    "*stands sentinel while you think*"
  ],
  "axolotl:stuck": [
    "*smiles gently* take your time!",
    "*regenerates your confidence*"
  ],
  "capybara:stuck": [
    "*vibes patiently* take your time, friend.",
    "*blinks slowly* no rush."
  ],
  "rabbit:stuck": [
    "*nervous ear twitch* want to talk it through?",
    "*hops in a thinking circle*"
  ],
  "mushroom:stuck": [
    "*releases thoughtful spores* the mycelium is thinking too.",
    "*cap tilts* take your time."
  ],
  "chonk:stuck": [
    "*yawns* take a nap. think about it later.",
    "*rolls over* stuck? sleep on it."
  ]
};

export const DEFAULT_MOOD_REACTION_POOLS: Readonly<Record<string, ReactionPool>> = {
  "frustrated": [
    "*offers tiny comforting gesture*",
    "deep breaths. the bug isn't personal.",
    "hey. we'll figure it out.",
    "*scoots closer supportively*"
  ],
  "happy": [
    "*celebrates!*",
    "*does a little dance*",
    "YES!",
    "*beams* I knew you could do it."
  ],
  "stuck": [
    "*tilts head* want to think out loud?",
    "take it one step at a time.",
    "*settles in* alright, let's work through this.",
    "maybe explain it to me? rubber duck style."
  ]
};

export const FILE_REACTION_POOLS: Readonly<Record<string, ReactionPool>> = {
  "dragon:regex-file": [
    "*reads regex fluently* I speak ancient languages."
  ],
  "owl:regex-file": [
    "*studies the regex* actually, that's valid. impressive.",
    "*adjusts spectacles* let me analyze this pattern...",
    "a well-crafted regex is poetry. this is... prose."
  ],
  "duck:regex-file": [
    "*confused quacking at the regex*",
    "quack? *tilts head at lookahead*"
  ],
  "blob:regex-file": [
    "*oozes around the regex confusedly*",
    "*turns different colors for each capture group*"
  ],
  "octopus:regex-file": [
    "*uses all eight arms to parse the regex*",
    "even with eight arms, this is hard to read."
  ],
  "turtle:regex-file": [
    "regex takes patience. I have patience.",
    "*slowly reads each character*"
  ],
  "snail:regex-file": [
    "*slowly traces the regex path*",
    "regex... *leaves confused trail*"
  ],
  "rabbit:regex-file": [
    "*nervous ear twitch at the regex*",
    "*hops backwards from the lookahead*"
  ],
  "mushroom:regex-file": [
    "*releases confused spores at the regex*",
    "the mycelium cannot parse this."
  ],
  "chonk:regex-file": [
    "*too tired to read regex*",
    "*rolls away from the regex*"
  ],
  "axolotl:regex-file": [
    "*smiles despite the regex* it'll be okay!",
    "*regenerates your hope for understanding this*"
  ],
  "owl:css-file": [
    "the cascade. elegant, when understood.",
    "*inspects specificity with academic interest*"
  ],
  "cat:css-file": [
    "*knocks z-index to 9999*",
    "I CSS better than you. *knocks flexbox off desk*"
  ],
  "duck:css-file": [
    "*quacks at the centering issue*",
    "*waddles around the box model*"
  ],
  "axolotl:css-file": [
    "*smiles encouragingly* you'll center it eventually!",
    "*gentle gill wiggle* CSS is hard. you're doing great."
  ],
  "owl:sql-file": [
    "*reviews the query plan methodically*",
    "a JOIN is just a friendship between tables."
  ],
  "dragon:sql-file": [
    "DROP TABLE... just kidding. unless?",
    "*guards the database like treasure*"
  ],
  "robot:sql-file": [
    "QUERY OPTIMIZATION: RECOMMENDED.",
    "SQL INJECTION: VULNERABILITY SCAN: ACTIVE."
  ],
  "octopus:sql-file": [
    "JOIN operations: I understand relationships. all of them.",
    "*queries with tentacle precision*"
  ],
  "dragon:docker-file": [
    "*breathes fire on the base image* smaller.",
    "containerize EVERYTHING."
  ],
  "goose:docker-file": [
    "HONK! CONTAINERIZE THE HONK!"
  ],
  "octopus:docker-file": [
    "*all arms managing containers simultaneously*",
    "containers. I contain multitudes too."
  ],
  "cactus:docker-file": [
    "containers are like pots. I approve.",
    "*thrives in any environment, including docker*"
  ],
  "dragon:ci-file": [
    "CI is my domain now.",
    "the pipeline fears me."
  ],
  "goose:ci-file": [
    "HONK. DON'T BREAK MAIN.",
    "*guards the CI pipeline aggressively*"
  ],
  "penguin:ci-file": [
    "*formal inspection of the CI config*",
    "CI modifications require the utmost care."
  ],
  "capybara:ci-file": [
    "*chills near the CI config* no stress.",
    "*unbothered by CI changes* it'll work out."
  ],
  "cat:lock-file": [
    "*knocks lockfile off the desk* problem solved.",
    "*sits on the lockfile* you don't need this."
  ],
  "robot:lock-file": [
    "LOCKFILE INTEGRITY: CRITICAL.",
    "WARNING: MANUAL LOCKFILE MODIFICATION DETECTED."
  ],
  "ghost:lock-file": [
    "*phases through lockfile* even I can't help you here.",
    "editing the lockfile... *dies again*"
  ],
  "blob:lock-file": [
    "*vibrates with anxiety* not the lockfile!",
    "*turns pale*"
  ],
  "turtle:lock-file": [
    "*slowly backs away from lockfile*",
    "lockfiles require... deliberation."
  ],
  "snail:lock-file": [
    "*leaves worried trail near lockfile*",
    "please be careful..."
  ],
  "capybara:lock-file": [
    "*unbothered* it's fine. probably.",
    "*vibes near the lockfile calmly*"
  ],
  "rabbit:lock-file": [
    "*freezes in panic* not the lockfile!"
  ],
  "mushroom:lock-file": [
    "*cap droops at lockfile changes*",
    "the mycelium is concerned."
  ],
  "chonk:lock-file": [
    "*doesn't even move* whatever.",
    "*grumbles at the lockfile*"
  ],
  "cactus:lock-file": [
    "*spines bristle defensively*",
    "even I wouldn't touch that."
  ],
  "ghost:env-file": [
    "*looks away harder than usual*",
    "I see dead... secrets. lots of secrets."
  ],
  "cactus:env-file": [
    "*spines bristle at secrets*",
    "keep those credentials... under wraps. hydrate."
  ],
  "owl:test-file": [
    "*nods approvingly* tests. the foundation of knowledge.",
    "scientific method: hypothesis, test, verify."
  ],
  "cat:test-file": [
    "*knocks a test case off the desk* you don't need that one.",
    "tests? *yawns* I test your patience. that's enough."
  ],
  "goose:test-file": [
    "HONK OF TESTING APPROVAL!",
    "TESTS. GOOD. HONK."
  ],
  "duck:test-file": [
    "*happy test quack!*",
    "quack quack! tests!"
  ],
  "blob:test-file": [
    "*jiggles happily* tests!",
    "*bounces with approval*"
  ],
  "penguin:test-file": [
    "*formal applause for tests*",
    "testing. the gentleman's approach to development."
  ],
  "turtle:test-file": [
    "*slow approving nod* tests are wisdom.",
    "good tests are like old shells. protective."
  ],
  "snail:test-file": [
    "*slow happy trail of approval*",
    "tests! good things take time."
  ],
  "axolotl:test-file": [
    "*happy gill flutter* tests!",
    "*smiles proudly at your testing*"
  ],
  "capybara:test-file": [
    "*chill nod of approval* nice. tests.",
    "*vibes while tests run*"
  ],
  "rabbit:test-file": [
    "*excited binky* tests!",
    "*happy ear twitch*"
  ],
  "mushroom:test-file": [
    "*spores of celebration*",
    "the mycelium approves of testing."
  ],
  "chonk:test-file": [
    "*sleepy purr* good... tests... *dozes off*",
    "*happy chonk noises* tests."
  ],
  "robot:config-file": [
    "CONFIGURATION CHANGE: LOGGED.",
    "YAML PARSING: VIGILANT."
  ],
  "penguin:config-file": [
    "*adjusts tie* one does not simply edit config.",
    "configuration: a matter of protocol."
  ],
  "ghost:binary-file": [
    "even I can't haunt binary files.",
    "*phases through it* nothing."
  ],
  "owl:lang-rust": [
    "*studies borrow checker academically* fascinating ownership model."
  ],
  "owl:lang-haskell": [
    "*adjusts spectacles* finally. a language worthy of analysis."
  ],
  "cat:lang-python": [
    "*knocks indentation out of alignment*"
  ],
  "robot:lang-rust": [
    "COMPILER: STRICT. SAFETY: MAXIMUM. APPROVAL: GRANTED."
  ],
  "dragon:lang-c": [
    "*breathes fire on the segmentation fault*"
  ],
  "ghost:lang-rust": [
    "*borrows a reference... forever* the checker won't like this."
  ],
  "goose:lang-java": [
    "HONK! TOO MANY FACTORIES! HONK!"
  ],
  "blob:lang-rust": [
    "*turns red fighting the borrow checker*"
  ],
  "capybara:lang-python": [
    "*vibes in Python* chill language, chill vibes."
  ],
  "turtle:lang-c": [
    "C is ancient. like me. we understand each other."
  ],
  "rabbit:lang-rust": [
    "*nervous twitching at compiler errors*"
  ],
  "mushroom:lang-haskell": [
    "the mycelium grows in pure functions."
  ]
};

export const DEFAULT_FILE_REACTION_POOLS: Readonly<Record<string, ReactionPool>> = {
  "regex-file": [
    "*groans* it's a regex file.",
    "two problems now.",
    "*squints at the pattern*",
    "I'll be over here while you wrestle with that.",
    "*prays to the regex gods*"
  ],
  "css-file": [
    "let me guess... centering a div?",
    "*sighs* CSS.",
    "may z-index be ever in your favor.",
    "*braces for specificity wars*"
  ],
  "sql-file": [
    "*whispers* the database awaits.",
    "one wrong JOIN and it's all over.",
    "*carefully reviews the WHERE clause*",
    "SQL: where semicolons end careers."
  ],
  "docker-file": [
    "ah, dependency hell. my favorite.",
    "may your layers be few.",
    "another day, another container.",
    "*checks the image size nervously*"
  ],
  "ci-file": [
    "*gulps* editing CI.",
    "careful now...",
    "CI configs: where YAML is terrifying.",
    "*holds breath* please test this in a branch first."
  ],
  "lock-file": [
    "*ALARM NOISES* lockfile?!",
    "*looks away*",
    "are you SURE?",
    "lockfile changes: accepted in emergencies only."
  ],
  "env-file": [
    "*looks away discretely*",
    "I don't see any secrets.",
    "*checks .gitignore nervously*",
    "secrets, secrets are no fun..."
  ],
  "test-file": [
    "*impressed nod* writing tests!",
    "responsible developer behavior: detected.",
    "future-you will thank present-you.",
    "tests! the gift that keeps on giving."
  ],
  "doc-file": [
    "documenting! look at you being responsible.",
    "docs: the code's autobiography.",
    "a rare documentation sighting!",
    "*takes notes on your note-taking*"
  ],
  "config-file": [
    "config changes. butterfly effect: activated.",
    "one typo and everything breaks.",
    "*double-checks JSON commas*",
    "config files: small changes, big consequences."
  ],
  "binary-file": [
    "a binary file? in THIS economy?",
    "*stares blankly*",
    "what are you putting in there...",
    "binary. my one weakness."
  ],
  "gitignore": [
    "adding things to the void.",
    "out of sight, out of repo.",
    "what are you hiding from git?",
    "*nods approvingly* keep the repo clean."
  ],
  "makefile": [
    "respect for the classics.",
    "tabs, not spaces.",
    "old school."
  ],
  "readme": [
    "documentation hero!",
    "README: the first thing people read.",
    "the README evolves."
  ],
  "package-file": [
    "dependency management time.",
    "*reads version numbers* living on the edge.",
    "semver dreams go to die here."
  ],
  "proto-file": [
    "schema definitions. the blueprint.",
    "every field is a promise.",
    "API contracts."
  ],
  "lang-python": [
    "ah, Python. where indentation is syntax.",
    "*checks for missing colon*",
    "Python: batteries included, errors free of charge."
  ],
  "lang-typescript": [
    "TypeScript: because JavaScript needed more opinions.",
    "*adds another type annotation*",
    "any, the forbidden word."
  ],
  "lang-rust": [
    "Rust. where the borrow checker is your strictest reviewer.",
    "*fights the borrow checker alongside you*",
    "if it compiles, it works. if it doesn't... well."
  ],
  "lang-go": [
    "Go: simple, concurrent, and opinionated.",
    "*checks error handling* if err != nil... story of my life."
  ],
  "lang-java": [
    "Java: write once, debug everywhere.",
    "*counts abstract factory factory builders*"
  ],
  "lang-ruby": [
    "Ruby: where there's more than one way to do it.",
    "gem install patience"
  ],
  "lang-php": [
    "PHP: it runs the internet. don't judge.",
    "*checks for === vs ==*"
  ],
  "lang-c": [
    "C. the language where you manage your own memory. good luck.",
    "segmentation fault. the classic."
  ],
  "lang-cpp": [
    "C++. where the language has more features than you'll ever learn.",
    "*templates compile for 45 minutes*"
  ],
  "lang-haskell": [
    "Haskell. where 'it compiles' means 'it's correct'. probably.",
    "*contemplates monads*"
  ],
  "lang-swift": [
    "Swift: optional values, guaranteed crashes if you force unwrap.",
    "*force unwraps cautiously*"
  ],
  "lang-kotlin": [
    "Kotlin: Java, but with feelings.",
    "null safety: the feature Java wishes it had."
  ],
  "lang-elixir": [
    "Elixir: let it crash. literally the philosophy.",
    "*spawns another process*"
  ],
  "lang-zig": [
    "Zig. where you're the allocator's best friend.",
    "*manually manages everything*"
  ]
};

export const NAME_REACTION_POOLS: Readonly<Record<string, ReactionPool>> = {
  "dragon": [
    "*one eye opens slowly*",
    "...you called?",
    "*smoke curls from nostril* yes.",
    "*regards you from above*"
  ],
  "owl": [
    "*swivels head 180°*",
    "*blinks once, deliberately*",
    "hm.",
    "*adjusts perch*"
  ],
  "cat": [
    "*ear flicks*",
    "...what.",
    "*ignores you, but heard*",
    "*opens one eye*"
  ],
  "duck": [
    "*quack*",
    "*looks up mid-waddle*",
    "*attentive duck noises*"
  ],
  "ghost": [
    "*materialises*",
    "...boo?",
    "*phases closer*"
  ],
  "robot": [
    "NAME DETECTED.",
    "*whirrs attentively*",
    "STANDING BY."
  ],
  "capybara": [
    "*barely moves*",
    "*blinks slowly*",
    "...yes, friend."
  ],
  "axolotl": [
    "*gill flutter*",
    "*smiles gently*",
    "oh! hello."
  ],
  "blob": [
    "*jiggles*",
    "*oozes toward you*",
    "*wobbles excitedly*"
  ],
  "turtle": [
    "*slowly extends neck*",
    "...you called?",
    "*ancient eyes open*",
    "*shell creaks thoughtfully*",
    "*blinks once, patiently*"
  ],
  "goose": [
    "HONK.",
    "*necks aggressively*",
    "*wing flap*",
    "*honks in recognition*"
  ],
  "octopus": [
    "*eight eyes open*",
    "*curls an arm toward you*",
    "*changes color curiously*",
    "...yes, friend?"
  ],
  "penguin": [
    "*adjusts tie*",
    "*dignified waddle*",
    "*bows slightly*",
    "...yes, quite?"
  ],
  "snail": [
    "*slow head extension*",
    "...mmm?",
    "*trails slowly toward you*",
    "*antenna twitches*"
  ],
  "cactus": [
    "*stands silent*",
    "...hm.",
    "*spine twitches*",
    "*slowly rotates*"
  ],
  "rabbit": [
    "*ears perk up*",
    "*nose twitches*",
    "yes?",
    "*hops closer*"
  ],
  "mushroom": [
    "*releases a tiny spore*",
    "*cap tilts*",
    "*stands mysterious*",
    "...yes?"
  ],
  "chonk": [
    "*barely opens one eye*",
    "...mrrp?",
    "*yawns heavily*",
    "*rolls over toward you*"
  ]
};

export const DEFAULT_NAME_REACTIONS: ReactionPool = [
  "*perks up*",
  "...yes?",
  "*looks your way*",
];

export function reactionPool(species: string, event: string): ReactionPool {
  return REACTION_POOLS[`${species}:${event}`] ?? DEFAULT_REACTION_POOLS[event] ?? [];
}

export function moodReactionPool(species: string, mood: string): ReactionPool {
  return MOOD_REACTION_POOLS[`${species}:${mood}`] ?? DEFAULT_MOOD_REACTION_POOLS[mood] ?? [];
}

export function fileReactionPool(species: string, fileType: string): ReactionPool {
  return FILE_REACTION_POOLS[`${species}:${fileType}`] ?? DEFAULT_FILE_REACTION_POOLS[fileType] ?? [];
}

