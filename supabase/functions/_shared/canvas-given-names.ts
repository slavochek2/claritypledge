/**
 * P1536 (Design v6, S1.16): given names the owner's own messages are scanned for. A name on this list in an owner message
 * is a person other than the owner, so no point, story, focus, offer, question, note or reply may carry it.
 *
 * A bundled data file, no dependency. Words that are also ordinary words or months are left out on purpose (the
 * names filter's own NOT_NAMES check removes the rest at load time): a false drop costs one point and is told to the
 * owner, a leak puts a name on a canvas that can be shared by link. Extend the list freely; lower case, one token each.
 * Pure: no imports.
 */

const LATIN = (
  'aaron adam adrian ahmed alan albert alex alexander alexandra alexei alice alicia alina alison amanda amelia amy ana ' +
  'anastasia andrea andreas andrew andrey andy angela anja ann anna anne annette anton antonio arthur ashley barbara ' +
  'ben benjamin bernd beth björn boris brandon brian bruno carl carla carlos carol caroline catherine charles charlotte ' +
  'chris christian christina christine christoph claire clara claudia colin dan daniel danielle darius dave david ' +
  'dennis diana diego dmitri dmitry dominik donna dorothy douglas edward elena eleni elisa elizabeth ella ellen emil ' +
  'emilia emily emma erik erika eric ethan eva evelyn fabian felix fiona florian frank franziska frederic frederik ' +
  'gabriel gabriela gary george georg gerhard gina giorgio gregor gregory greta gustav hana hanna hannah hans harry ' +
  'heidi heike helen helena helga henri henrik henry hugo ian igor ilya ines ingrid irina isabel isabella ivan ivana ' +
  'jack jacob jakob james jan jana jane janet jasmin jason jean jennifer jens jeremy jessica joachim joan joanna joe ' +
  'johan johanna john jonas jonathan jorge jose joseph josef josephine juan judith julia julian juliane karen karin ' +
  'karl karolina kasper katarina kate katharina katherine kathrin kati katja katrin kevin kim kirsten klara klaus ' +
  'konstantin kristian kristina kristof kurt lars laura lauren lea lena leon leonard leonie leo lina linda lisa lorenzo ' +
  'louis louisa lucas lucia lucy ludwig luis luisa lukas luke lukas magdalena manuel marco marcus margaret margarita ' +
  'maria marian marianne marie marina mario marion markus marta martin martina marvin mary mateo mathias matteo ' +
  'matthew matthias max maxim maximilian megan melanie melissa michael michaela michal michelle miguel mika mikhail ' +
  'milan mohammed monika monica nadia nadine natalia natalie natasha nathan nicholas nick nico nicola nicole nikita ' +
  'nikolai nikolas nina noah nora norbert oleg olga oliver olivia omar oscar otto pablo patricia patrick paul paula ' +
  'paulina pavel pedro peter petra philip philipp pierre rachel rafael ralf ralph raphael rebecca regina reinhard ' +
  'renate richard robert roberto roland roman ronald rosa ruth ryan sabine sabrina sam samantha samuel sandra sara ' +
  'sarah sascha sebastian sergei sergey sergio sibylle silke simon simone sofia sonia sophia sophie stefan stefanie ' +
  'stella stephan stephanie stephen steve steven susan susanne svenja sven sylvia tamara tanja tatiana teresa teodor ' +
  'theodor thomas tim timothy tina tobias tom tomas tomasz tony ulrich ursula valentina valerie vanessa vera veronika ' +
  'victor viktor viktoria vincent vladimir walter wanda werner wilhelm william wolfgang xavier yan yana yuri yusuf ' +
  'zoe zofia'
).split(' ');

/** Given names in other scripts, as written. */
const OTHER_SCRIPTS = [
  'анна', 'иван', 'мария', 'ольга', 'дмитрий', 'сергей', 'елена', 'наталья', 'алексей', 'татьяна', 'андрей', 'михаил',
  'μαρία', 'γιώργος', 'νίκος', 'ελένη', 'محمد', 'أحمد', 'فاطمة', 'אנה', 'דוד', 'שרה', '安娜', '伟', '芳',
];

export const GIVEN_NAMES: ReadonlySet<string> = new Set([...LATIN, ...OTHER_SCRIPTS].filter(Boolean));
