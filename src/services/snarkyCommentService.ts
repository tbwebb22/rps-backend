const snarkyComments = [
    "May the odds be ever in someone's favor.",
    "Hope you're ready to entertain us - this should be good.",
    "Good luck! Try not to embarrass yourselves too badly out there.",
    "Let's see if either of you can actually live up to the hype.",
    "We're all here for the drama, so don't disappoint.",
    "I've got my popcorn ready - don't make this boring.",
    "One of you better put on a show worth watching.",
    "May the least terrible player win!",
    "Remember what Ricky Bobby said: If you're not first, you're last.",
    "I'm just here for the memes - good luck!",
    "Show us what you've got... if anything.",
    "This should be... educational.",
    "Time to separate the pros from the pretenders.",
    "Let's hope someone brought their A-game today.",
    "Prepare for glory... or something like it.",
    "The stage is set for either brilliance or disaster.",
    "Well, this should be... something.",
    "Betting pool's open on who messes up first.",
    "Finally, a chance to see if the rumors are true.",
    "Grab your beverage of choice folks, we're about to witness peak average.",
    "Prepare to be whelmed.",
    "Today's forecast: light gameplay with scattered disappointment.",
    "Watching paint dry was booked, so here we are.",
    "The only thing lower than expectations is probably the skill ceiling.",
    "Behold, the finest display of almost-competence you'll see today.",
    "They say it's not about winning or losing... which is convenient for these players.",
    "Witness the clash of the somewhat-trying!",
    "Buckle up for some thoroughly average entertainment.",
    "Welcome to the 'Could Be Worse But Not By Much' championship!",
    "Spoiler alert: Nobody's getting signed after this.",
    "This is what happens when you skip the tutorial.",
    "Coming up next: A masterclass in almost getting it right.",
    "The highlight reel will be very... selective.",
    "If mediocrity had a tournament, this would be the finals.",
    "Prepare for a stunning display of almost-achievements.",
    "Ah yes, the classic battle between bad and slightly less bad.",
    "This tournament is like a car crash - horrible but I can't look away.",
    "Time to show everyone why you didn't make the pro league.",
    "They say everyone has potential... still looking for it here.",
    "Proof that the ranked system needs work.",
    "Today's goal: Try to look like you've played this before.",
    "Spectators, keep your expectations where they belong - in the gutter.",
    "This is why we can't have nice tournaments.",
    "Time to demonstrate why this game isn't monetized.",
    "Witness history: The most average plays you'll see today.",
    "This is less 'edge of your seat' and more 'face in your palm'.",
    "The loading screen has better moves than these players.",
    "Welcome to the 'How Did They Get Here?' championship.",
    "Witness the power of button mashing at its finest.",
    "Prepare for gameplay that defies both logic and strategy.",
    "The servers considered crashing just to avoid this.",
    "The spectators are the real MVPs for sitting through this.",
    "Welcome to the 'Maybe Next Time' invitational.",
    "Don't let your nerves get the better of you - or do. It'll be funnier.",
    "The world is watching and expecting either brilliance or chaos. Either works.",
    "This better not be as pathetic as it looks already.",
    "Good luck - you're going to need a miracle to make this interesting.",
    "Let's see who manages to lose less embarrassingly.",
    "Honestly, I'm only watching this for the inevitable trainwreck.",
    "May the least incompetent player win.",
    "This is going to be the Farcaster equivalent of a bad karaoke night.",
    "Here's hoping one of you manages to figure out what's going on.",
    "Remember, we're all judging you. Harshly.",
    "Try not to cry when this inevitably goes south.",
    "One of you will win, but none of us will be impressed."
];

export function getRandomSnarkyComment(): string {
    const randomIndex = Math.floor(Math.random() * snarkyComments.length);
    return snarkyComments[randomIndex];
}