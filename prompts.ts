import type { PromptPair } from "@/shared/game-types";

type PromptSeed = {
  category: string;
  realContexts: string[];
  fakeContexts: string[];
};

const seeds: PromptSeed[] = [
  {
    category: "Food",
    realContexts: [
      "a camping trip",
      "a picnic in the park",
      "a late-night movie marathon",
      "a friend’s potluck",
      "a road trip snack stop"
    ],
    fakeContexts: [
      "your car for emergencies",
      "a desk drawer at work"
    ]
  },
  {
    category: "Travel",
    realContexts: [
      "a weekend getaway",
      "an airport layover",
      "a backpacking trip",
      "a hotel room",
      "a beach vacation"
    ],
    fakeContexts: [
      "a suitcase you forgot to unpack",
      "a glove compartment"
    ]
  },
  {
    category: "School",
    realContexts: [
      "the first day of class",
      "exam week",
      "a group project meeting",
      "the library",
      "a school field trip"
    ],
    fakeContexts: [
      "a job interview",
      "your old backpack from last year"
    ]
  },
  {
    category: "Dating",
    realContexts: [
      "a first date",
      "the texting stage",
      "meeting their parents",
      "a long-distance relationship",
      "a breakup recovery night"
    ],
    fakeContexts: [
      "a wedding reception",
      "your notes app after 2 a.m."
    ]
  },
  {
    category: "Work",
    realContexts: [
      "a Monday morning meeting",
      "a deadline crunch",
      "a team offsite",
      "an office happy hour",
      "your first day on the job"
    ],
    fakeContexts: [
      "a freelance gig emergency",
      "a kitchen table during tax season"
    ]
  },
  {
    category: "Technology",
    realContexts: [
      "a dead phone battery",
      "a software update",
      "a gaming session",
      "working from home",
      "setting up a new laptop"
    ],
    fakeContexts: [
      "a router outage",
      "a random settings menu you opened by mistake"
    ]
  },
  {
    category: "Childhood",
    realContexts: [
      "a sleepover",
      "the school playground",
      "a birthday party",
      "a family road trip",
      "summer vacation"
    ],
    fakeContexts: [
      "your parents' car",
      "a toy box in the attic"
    ]
  },
  {
    category: "Emergencies",
    realContexts: [
      "a power outage",
      "a minor kitchen fire scare",
      "a lost wallet situation",
      "a stormy night",
      "getting stuck somewhere late"
    ],
    fakeContexts: [
      "a first-aid kit",
      "a roadside breakdown"
    ]
  },
  {
    category: "Shopping",
    realContexts: [
      "a grocery run",
      "the mall",
      "an online checkout cart",
      "a clearance sale",
      "a last-minute gift trip"
    ],
    fakeContexts: [
      "your trunk after bulk shopping",
      "a coupon folder you swear you use"
    ]
  },
  {
    category: "Parties",
    realContexts: [
      "a house party",
      "a birthday bash",
      "a holiday gathering",
      "a rooftop hangout",
      "a game night"
    ],
    fakeContexts: [
      "a neighbor’s get-together",
      "a cooler in the back seat"
    ]
  },
  {
    category: "Internet Culture",
    realContexts: [
      "a group chat meltdown",
      "a viral meme trend",
      "a doomscrolling session",
      "a comment section fight",
      "a late-night Reddit rabbit hole"
    ],
    fakeContexts: [
      "your browser history",
      "a notes app full of nonsense"
    ]
  },
  {
    category: "Fitness",
    realContexts: [
      "a gym session",
      "a morning run",
      "a yoga class",
      "a sports practice",
      "a hike"
    ],
    fakeContexts: [
      "a locker room",
      "the back of your car after a workout"
    ]
  },
  {
    category: "Family",
    realContexts: [
      "a family dinner",
      "a reunion",
      "visiting grandparents",
      "a sibling’s big event",
      "a holiday at home"
    ],
    fakeContexts: [
      "your childhood bedroom",
      "a group text from relatives"
    ]
  },
  {
    category: "Holidays",
    realContexts: [
      "Christmas morning",
      "a summer barbecue",
      "Halloween night",
      "New Year’s Eve",
      "Thanksgiving dinner"
    ],
    fakeContexts: [
      "a seasonal storage bin",
      "a gift bag in your closet"
    ]
  },
  {
    category: "Transportation",
    realContexts: [
      "a train ride",
      "a bus commute",
      "a long car trip",
      "an airport pickup",
      "a bike ride around town"
    ],
    fakeContexts: [
      "the trunk of a shared car",
      "a subway seat pocket"
    ]
  },
  {
    category: "Survival",
    realContexts: [
      "a camping emergency",
      "getting lost on a hike",
      "a weekend blackout",
      "being stranded after dark",
      "a cold night outdoors"
    ],
    fakeContexts: [
      "an emergency kit",
      "a survival backpack"
    ]
  },
  {
    category: "Money",
    realContexts: [
      "payday",
      "a big unexpected bill",
      "budgeting for a trip",
      "splitting dinner with friends",
      "finding cash in an old jacket"
    ],
    fakeContexts: [
      "your wallet at the end of the month",
      "a savings jar on your desk"
    ]
  },
  {
    category: "Social Media",
    realContexts: [
      "posting a selfie",
      "making a story post",
      "a photo dump",
      "a livestream",
      "replying to DMs"
    ],
    fakeContexts: [
      "your camera roll",
      "a private finsta"
    ]
  },
  {
    category: "Pets",
    realContexts: [
      "walking a dog",
      "cleaning a cat mess",
      "a vet visit",
      "pet training",
      "leaving the house for the day"
    ],
    fakeContexts: [
      "a pet carrier",
      "the glove box with pet supplies"
    ]
  },
  {
    category: "Weird Life Situations",
    realContexts: [
      "getting invited to a wedding by mistake",
      "meeting someone with the same name as you",
      "being locked out of your house",
      "running into an ex at the supermarket",
      "a neighbor borrowing something and never returning it"
    ],
    fakeContexts: [
      "an awkward family group chat",
      "a forgotten pocket full of receipts"
    ]
  }
];

export const PROMPT_PAIRS: PromptPair[] = seeds.flatMap((seed) =>
  seed.realContexts.flatMap((realContext) =>
    seed.fakeContexts.map((fakeContext) => ({
      category: seed.category,
      realPrompt: `Things you'd bring to ${realContext}`,
      fakePrompt: `Things you'd keep for ${fakeContext}`
    }))
  )
);

export function pickPromptPair(roundNumber: number) {
  return PROMPT_PAIRS[(Math.abs(roundNumber * 13 + 7) + Math.floor(Math.random() * PROMPT_PAIRS.length)) % PROMPT_PAIRS.length];
}
