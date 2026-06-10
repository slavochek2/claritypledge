import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StoryCardWithLinks } from "@/app/components/social/story-card-with-links";
import { PointCardWithLinks, type StoryAuthor } from "@/app/components/social/point-card-with-links";
import type { Story as DemoStory, Point as DemoPoint } from "@/app/components/shared/prototype-types";
import type { SevenPointCounts } from "@/app/components/shared/PositionButton";

/**
 * USP contrast demo — preserved from the coach landing page (cut 2026-06, founder
 * decision: too abstract for a coach conversion page; kept here so the component
 * and its "show, don't tell" treatment survive for future product/how-it-works use).
 *
 * Demonstrates the product's two atoms with the REAL interaction components:
 * a story's MEANING gets verified, a point's VALIDITY gets a position (live buttons).
 */

// Story: stories 883d89f5 (#st1 #understanding) — full content, image, author.
// Point: points f8629cdd (st1, v3 = current version) — statement + live positions.
const ST1_AUTHOR: StoryAuthor = {
  id: "a99042ef-e740-446a-8734-389c8589cc17",
  name: "Vyacheslav Ladischenski",
  hasPledged: true,
  avatarUrl: "https://lh3.googleusercontent.com/a/ACg8ocJSyqNiPdWG0DB8otTM-4KXPW1lowW48GIrZOi1K4U6UcIn6eXUKQ=s96-c",
};

const ST1_STORY: DemoStory = {
  id: "883d89f5-4449-46b2-a663-f4f2c7204c22",
  text: "They're someone I've known for years. We were on a call trying to work something out. I paraphrased their position back to them. They said yes, that's right, you understood me. A few days later, they said they didn't feel understood. My first thought: their memory was failing them. They'd forgotten. I had the confirmation. They'd said it themselves. But then I recognized it. They'd confirmed one thing and were wishing for another. Same word: understand. Two completely different meanings. They confirmed I cognitively understood them. I reproduced their position accurately. But what they needed was emotional understanding. Feeling what they were feeling. Without that distinction named, it looks like they're lying. Or misremembering. They weren't. They just had no language for the split. Neither did I. Not until that moment. #st1 #understanding",
  authorId: ST1_AUTHOR.id,
  createdAt: "2026-02-25T05:01:00Z",
  visibility: "public",
  linkedPointIds: ["f8629cdd-aa5d-432e-90ae-1c1e8c07be73"],
  understoodCount: 0,
  imageUrl: "https://storage.googleapis.com/claritypledge-story-images/story-images/883d89f5-4449-46b2-a663-f4f2c7204c22/ce9328cc-621e-47b1-90f0-26baea23eed4.jpg",
};

const ST1_POINT: DemoPoint = {
  id: "f8629cdd-aa5d-432e-90ae-1c1e8c07be73",
  text: 'When someone says "you don\'t understand me," they could mean at least three different things. They might mean I don\'t feel what they feel. They might mean I don\'t agree with them. Or they might mean they don\'t know whether I actually know what they mean. These are three separate requests. Satisfying one doesn\'t necessarily satisfy the others. The word "understand" never tells me which kind of understanding is being asked for.',
  createdAt: "2026-04-13T13:08:40Z",
  positions: {},
  linkedStoryIds: [],
  visibility: "public",
};

// Real position counts on the st1 v3 point (prod, at snapshot time).
const ST1_POINT_COUNTS: SevenPointCounts = {
  strongly_agree: 2,
  agree: 2,
  somewhat_agree: 0,
  unsure: 0,
  somewhat_disagree: 0,
  disagree: 0,
  strongly_disagree: 0,
};

const ST1_TAGS = ["st1", "understanding"];

export function UspContrastDemo() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <section className="px-4 py-20 lg:py-28">
        <div className="container mx-auto max-w-4xl">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-center mb-12">
            Stories verify <span className="text-blue-500">meaning</span>.
            <br />
            Points verify <span className="text-blue-500">validity</span>.
          </h2>
          {/* max-w-2xl: wider story = less scrolling; still under the ~75ch
              readability ceiling for the card's text size */}
          <Tabs defaultValue="story" className="max-w-2xl mx-auto">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="story">A story</TabsTrigger>
              <TabsTrigger value="point">A point</TabsTrigger>
            </TabsList>
            {/* The REAL story card — st1 with image + author avatar */}
            <TabsContent value="story">
              {/* context="point-detail" hides the footer row (points expander + "0 points") —
                  the point has its own tab here, no in-card peek. */}
              <StoryCardWithLinks
                story={ST1_STORY}
                author={ST1_AUTHOR}
                getPointPositionCounts={() => ST1_POINT_COUNTS}
                context="point-detail"
                disableNavigation
                tags={ST1_TAGS}
              />
            </TabsContent>
            {/* The REAL point card — st1 v3 with live position buttons (anon clicks persist locally) */}
            <TabsContent value="point">
              <PointCardWithLinks
                point={ST1_POINT}
                disableNavigation
                getPointPositionCounts={() => ST1_POINT_COUNTS}
                tags={ST1_TAGS}
              />
            </TabsContent>
          </Tabs>
        </div>
      </section>
    </div>
  );
}
