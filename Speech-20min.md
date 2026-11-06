# Predicting Nature's Bad Days: How I Built a Calamity Risk Estimator

*A 20-minute talk for a Class 11 audience. About 2,700 words, spoken at a relaxed pace of roughly 135 words a minute. Times in brackets are a guide. Slide numbers match `Calamity-Risk-Estimator.pptx`.*

---

## [0:00 – 2:00] Opening (Slide 1)

Good morning, everyone.

Let me start with a question. Can anyone tell me what the weather will be on the 15th of July, 2027?

*(Pause. Let them answer.)*

Nobody can. Not me, not a weather channel, not even a supercomputer. Weather is chaotic. A forecast is reliable for a few days, and after about two weeks it is basically guesswork.

But here is something we *can* do. We can ask a different question: "In the past thirty-five Julys in Chennai, how often did something dangerous happen? Is it becoming more common? And what should I do to be ready?"

That is a different kind of question. It is not a forecast. It is **statistics about the past, used to estimate risk**. Insurance companies, city planners and disaster-management teams ask exactly this kind of question all the time.

Today I will show you a tool I built that answers it. It is called the **Natural-Calamity Risk Estimator**. I will explain what it does, how the maths works, and, since this is the part many of you will find interesting, how I built it with the help of artificial intelligence, and what I learned about using AI honestly.

Please keep one sentence in your head the whole time: **this is an estimate, not a forecast.** It is even written at the top of the page.

---

## [2:00 – 6:00] What the tool does (Slide 2)

Let me describe the tool the way a user would see it.

You open one web page. There are three boxes. First, a **place**, for example "Chennai, India". Second, a **month**, say July. Third, a **year**, for example 2027. The year automatically starts as next year, but you can type any future year.

You press the button "Estimate risk". After a few seconds the page fills with six things.

**One: a headline summary.** It reads something like: "Chennai, July 2027, expected rain 119 millimetres, range 76 to 169, flood-risk probability 0 percent, heat-risk 1 percent, storm-risk 0 percent." Notice the word *range*. We never give one magic number, because the real world always varies.

**Two: a bar chart.** Each blue bar is the total rain in July of a past year, from 1991 to 2025. A dashed line shows the trend, whether Julys are getting wetter or drier. And one orange bar shows the estimate for the year you chose.

**Three: a hazard table.** I picked three kinds of danger: heavy rain that can cause floods, extreme heat, and strong wind that can come with cyclones. For each, the table shows a threshold, a probability, and how confident we are. Under every number there is a plain-English sentence, such as "In 0 of 35 past Julys the wettest day went above 64.5 millimetres."

**Four: the worst past years.** The three wettest, hottest and windiest, with their actual dates. This makes the numbers feel real. In Chennai, for example, the wettest July in this data was 2020.

**Five: an area map.** The tool picks nine points around the city centre, in a three-by-three grid, within about fourteen kilometres. It ranks them by rain, shows each one's height above sea level, and flags low-lying points, because water flows downhill and collects in low ground. It also looks up the real names of those places from OpenStreetMap. I will come back to why I was careful about that.

**Six: preparedness steps.** If a hazard looks likely, the page gives a short checklist: know your higher ground, protect documents, keep a torch and water, never walk through floodwater. For heat: drink water, avoid the afternoon, check on elderly neighbours.

And on top of everything is a bold disclaimer: *"Statistical estimate from ERA5 reanalysis, about 25 kilometres grid, not an official forecast. Check IMD and local authorities for warnings."* The tool helps you think and prepare. It does not replace the Indian Meteorological Department.

---

## [6:00 – 12:00] How it works (Slide 3)

Now the interesting part: how does the page come up with those numbers? There are five steps. I promise the maths is only as hard as Class 11.

### Step 1: Find the place

A computer does not understand "Chennai". It needs coordinates, a latitude and longitude. A free service called **Open-Meteo** has a geocoding service: you send it a name and it replies with coordinates. If you type nonsense, it sends back an empty result, and my page shows a polite error instead of crashing.

### Step 2: Download the history

Open-Meteo also offers historical weather data. It comes from something called **ERA5 reanalysis**. Here is the idea. Scientists take millions of old measurements from weather stations, balloons and satellites, and feed them into a physics-based model to rebuild the weather of the past, hour by hour, on a grid of squares about 25 kilometres wide. That is why the disclaimer mentions a 25-kilometre grid: the tool cannot see your street, only the square your street sits in.

My page downloads daily rainfall, the hottest temperature of each day, and the strongest wind gust of each day, for every day from 1991 to last year. That is over twelve thousand days. All of it is calculated inside your browser. I have no server of my own.

### Step 3: Summarise the month

For July, I go through every July from 1991 to 2025 and compute: total rain, the wettest single day, the number of days above 64.5 millimetres, the hottest day, and the strongest gust. That gives me one row per year. Thirty-five years, thirty-five rows.

Why 64.5 millimetres? That is the number the Indian Meteorological Department uses as its **"heavy rain"** line. Above 115.6 millimetres is "very heavy". These are official definitions, not numbers I made up. For heat I used 40 degrees Celsius, and for wind 90 kilometres per hour, which I chose as a simple cyclone-strength line. Be honest about it: those two are my choices, not official definitions.

### Step 4: Fit a trend line

You have seen this in maths. If you plot points on a graph and draw the best straight line through them, that is a **line of best fit**. The standard method is called **least squares**: choose the line that makes the total of the squared gaps between the points and the line as small as possible.

I plot year on the x-axis and July rain on the y-axis. The line has a slope. For Chennai the slope came out at about 2.2 millimetres per year, so Julys have been getting slightly wetter. To estimate 2027, I read the line's value at 2027.

But a single number would be dishonest, because individual years bounce far above and below the line. So I look at the gaps between each real year and the line. These gaps are called **residuals**. I sort them and take the **10th percentile** and the **90th percentile**. A percentile is just a position in a sorted list: the 10th percentile is the value that 10 percent of the list falls below. Adding those two values to the trend gives a range. In plain words: "If the future behaves like the past, about eight out of ten Julys should land in this range."

One safety rule: if I have fewer than fifteen years of data, a trend line is too shaky. Then the tool uses the plain average and labels the confidence as low.

### Step 5: Estimate the chances

For each hazard I ask: in how many of the past years did the worst day cross the threshold? If it happened in 7 out of 35 years, the simple answer is 20 percent. That is the historical share.

Then I do the same thing again after shifting each year onto the trend line, to account for change over time. Finally I average the two answers. It is a simple, explainable recipe. Is it perfect? No. It is easy to defend, and that matters.

Notice something interesting in the Chennai result. The flood-risk probability for July is zero. That does not mean Chennai never floods! Chennai's big floods happen in the **northeast monsoon**, around October to December. July is a relatively tame month there. When I tried **Mumbai in August**, the page said the flood-level rain probability was 56 percent. Same tool, different place and month, very different answer. That is the whole point: risk depends on *where* and *when*.

---

## [12:00 – 17:00] How I built it, and the role of AI (Slide 5)

Now let me tell you how it was made, because I think this part teaches more than the code does.

### Write the rules before the code

I did not just say "make me a weather app". I wrote a detailed brief first, like a client briefing a developer. It had a goal, the exact inputs and outputs, and constraints. Some of my constraints were: *never hardcode or invent data for Chennai or anywhere else*; *never claim an exact forecast*; *use plain HTML, CSS and JavaScript, no framework*; *keep the code small enough that a student can explain it*.

That last rule is the reason I can stand here and explain every part. If AI writes code you do not understand, you have not built anything. You have borrowed it.

### Make the AI check facts first

AI assistants can sound confident and still be wrong. So my first instruction was: *verify the web addresses and parameter names against the live service. Do not guess.* The AI actually made real requests to Open-Meteo and looked at what came back. That is how we learned, for example, that a nonsense place name returns an answer with no "results" at all, which we needed to handle, and that asking for several locations in one request returns a list.

### Build in small, readable pieces

The AI wrote four files. `index.html` is the page structure. `style.css` is how it looks. `app.js` is the brain. `README.md` explains the limits. In `app.js` the statistics live in small, clearly named functions: one for the trend line, one for percentiles, one for forecasting, one for probability. Each has a one-line comment. A teacher can ask "what does this function do?" and the answer fits in a sentence.

### Test it

I asked for a **self-check**: if you open the page with `?test=1` at the end of the address, it runs seven small tests on known numbers. For example, if the points lie exactly on the line y equals 2x, the slope must come out as exactly 2. The median of 1, 2, 3, 4, 5 must be 3. All seven pass. This is a real professional habit: **test your maths on cases where you already know the answer.**

Then we ran the whole page in a browser with Chennai in July, Mumbai in August, and a gibberish place name, and checked the console for errors.

### Where the AI got it wrong, and we fixed it

This is my favourite part. In the first version, the area ranking for Chennai marked *all nine points* as "Higher risk". Why? The code scaled each point against the wettest one, so even tiny differences, like 94 versus 100 millimetres, looked like a big gap. That is a misleading result. We noticed it by actually looking at the output, not by trusting the code. The fix: if the nine points differ by less than 15 percent, the page now says "Similar across area" instead of pretending there is a winner.

Also, there was a second bug waiting to happen where a variable was used before it was defined. The browser test caught it before I did.

### Where I stayed in charge

When I asked for real neighbourhood names, the AI pointed out that this needs a new service that was not on my approved list, and *asked before adding it*. I said yes. That is how it should work: the human decides what goes into the project. And I set a rule: only show names the service actually returns. If a point is over the sea, the page says "no named place" rather than inventing one.

So the lesson for all of you, whether you use AI for code, essays or science projects: **AI is a fast, tireless assistant, not an authority.** Give it clear rules. Make it check facts. Test the results yourself. Understand everything you submit.

---

## [17:00 – 19:00] Limits and next steps (Slide 6)

Every good project ends with honest limits.

First, **resolution**. The data comes in squares about 25 kilometres wide. A flash flood on one street will not show up. Several of my nine map points land in the same square, so differences between them are coarse.

Second, **the model is just a straight line**. Real climate has cycles, like El Niño and the monsoon patterns, which a straight line cannot capture. And remember, year-to-year swings are much bigger than the trend.

Third, **wind gusts are only a proxy for cyclones**. A real cyclone has a track, a path across the sea. My tool just notices strong gusts.

So what could come next? You could try a better statistical model, such as **ARIMA** for time series, or a machine-learning model. You could bring in real **IMD weather-station data** to correct the grid. And you could use **GDACS cyclone tracks** to count real cyclones instead of guessing from wind. Each of those is a good Class 12 or first-year-college project.

---

## [19:00 – 20:00] Closing (Slide 4, then back to Slide 1)

Let me leave you with the example once more. For Chennai in July 2027 the tool says: about 119 millimetres of rain, likely between 76 and 169, with a very low chance of flood-level rain. Not a promise. A *reasoned estimate with honest edges*.

Three takeaways.

One: **statistics can answer useful questions even when forecasting is impossible.**

Two: **good numbers come with a range, a reason and a warning label.**

Three: **use AI like a very fast assistant, and stay the person who decides, checks and understands.**

And one last time, in real life: if the Indian Meteorological Department or your local authority issues a warning, follow it, not my web page.

Thank you. I would be happy to take your questions.

---

### Likely questions (cheat sheet)

- **Why not just use a weather forecast API?** Forecasts stop after about two weeks. This tool answers "how risky is a typical July?" for any future year.
- **Why is Chennai's July flood risk 0%?** Because in 35 years of this data, no July day crossed 64.5 mm. Chennai's heavy rain mainly falls in the northeast monsoon, October to December. Try those months.
- **Is 0% really zero?** No. It means "not seen in the data", and the table marks confidence as low when events are rare.
- **What is a percentile?** A position in a sorted list. The 90th percentile is higher than 90% of the values.
- **What is a residual?** The gap between a real data point and the trend line.
- **Where does the data come from?** Open-Meteo's archive of ERA5 reanalysis. No API key is needed.
- **Did the AI do all the work?** It wrote most of the code and ran checks. I wrote the brief, chose the thresholds, approved the choices, checked the results and can explain every function.
