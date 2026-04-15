# Reddit Question Queue — Way of Wealth Blog

This is the keyword-mining queue. Each entry is a Jess question harvested from Reddit (in her language, not ours). When the next person Googles that exact question, our blog post is the answer.

**Source subreddits:** r/UKPersonalFinance, r/MoneyDiariesACTIVE, r/ADHD (money threads), r/povertyfinance, r/personalfinance, r/financialindependence, r/Mortgages

**Workflow:**
1. Top of queue → next blog post
2. Pick the question → match to behavioral econ concept → 1200-1500 words → publish
3. Replenish queue weekly via Reddit scan (xpoz MCP `getRedditPostsByKeywords`)

**Status legend:** 🔵 queued · 🟡 drafting · ✅ published · ⏸ parked

---

## Active Queue

| # | Status | Jess question (her words) | Behavioral concept | Category | ICP segment |
|---|--------|---------------------------|--------------------|----------|-------------|
| 1 | ✅ | Why am I scared to check my bank account? | Ostrich effect, anticipated regret | Anxiety & avoidance | Anxious Avoider |
| 2 | ✅ | Why do I overspend right after payday? | Mental accounting, peak-end effect | Spending & shame | Anxious Avoider |
| 3 | ✅ | I keep starting budgets and giving up — what's wrong with me? | Status quo bias, planning fallacy, identity-based change | Budgeting that sticks | All segments |
| 4 | 🔵 | Why do I impulse buy when I'm stressed? | Emotional regulation via consumption, hot/cold empathy gap | Spending & shame | Anxious Avoider, ADHD |
| 5 | 🔵 | How do I budget when my income is different every month? | Envelope budgeting redesigned for irregular income, base rate buffering | Self-employed | Self-Employed Stresser |
| 6 | 🔵 | Why does my partner spend differently to me and how do we not fight about it? | Loss aversion asymmetry, money scripts (Klontz) | Behavioral basics | All segments |
| 7 | 🔵 | I have ADHD — why is every budgeting app I try useless after a week? | Novelty decay, dopamine-driven planning, friction design | ADHD & money | ADHD/Neurodivergent |
| 8 | 🔵 | Should I pay off debt or build savings first? (the actual answer) | Debt aversion, loss framing, behavioral debt snowball | Behavioral basics | All segments |
| 9 | 🔵 | Why do I feel guilty buying things I can afford? | Money scripts, frugality identity, scarcity hangover | Spending & shame | Anxious Avoider, ADHD |
| 10 | 🔵 | How do I stop avoiding my financial admin (taxes, statements, bills)? | Avoidance loop, exposure desensitisation, micro-commitments | Anxiety & avoidance | Self-Employed Stresser |
| 11 | 🔵 | Why is talking about money with my family so hard? | Money taboo, status threat, family money scripts | Behavioral basics | All segments |
| 12 | 🔵 | How much should I have saved by 30/35/40? (and why the answer is wrong) | Social comparison, anchoring, status anxiety | Behavioral basics | All segments |
| 13 | 🔵 | Why do I feel poor even though I earn well? | Hedonic treadmill, lifestyle creep, reference point bias | Behavioral basics | All segments |
| 14 | 🔵 | Is it normal to cry over money? | Money shame, financial trauma, Window of Tolerance | Anxiety & avoidance | All segments |
| 15 | 🔵 | Why do I keep buying things that "future me" will deal with? | Present bias, hyperbolic discounting, temporal self-discontinuity | Spending & shame | ADHD/Neurodivergent |
| 16 | 🔵 | Why can't I keep a job with ADHD? | executive function debt, present bias | ADHD & money | ADHD/Neurodivergent |
| 17 | 🔵 | Why do I have £10k saved but still £10k in debt? | mental accounting, loss aversion | Anxiety & avoidance | Anxious Avoider |
| 18 | 🔵 | Can I rebuild my career after burnout at 40? | sunk cost fallacy, planning fallacy | ADHD & money | ADHD/Neurodivergent, Self-Employed Stresser |
| 19 | 🔵 | Why do I feel like a failure at 25 with money? | social comparison, money scripts | Anxiety & avoidance | Anxious Avoider |
| 20 | 🔵 | Should I say no when family asks me for money I can't afford? | money scripts, loss aversion | Spending & shame | All segments |

---

## Harvest Notes

**Search patterns that work** (use these on xpoz `getRedditPostsByKeywords`):
- `"why do I" budget OR money OR spend OR save`
- `"why am I" + bank OR money OR financial`
- `"how do I stop" + spending OR avoiding OR overdrawing`
- `ADHD + money OR budget OR finances`
- `self-employed + tax OR irregular OR savings`

**What makes a good question:**
1. Phrased as a question Jess would type into Google (not a finance term we'd use)
2. Has emotion in it — shame, fear, confusion, frustration
3. Maps cleanly to a single behavioral concept (don't blend three)
4. Search-volume worthy — multiple variations of it appear in Reddit

**What to skip:**
- Pure tactical/calculation questions ("what's the best ISA?") — these are crowded and we don't want to compete on calculations
- Anything that requires regulated advice (specific investment recs, mortgage decisions)
- Anything that pushes us into hustle/manifestation territory
