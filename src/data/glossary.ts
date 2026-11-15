/** Plain-language definitions of the metrics & methods used across BullDozer. */
export interface Term {
  term: string;
  short: string;
  body: string;
}

export const glossary: Term[] = [
  {
    term: 'Period-over-period change',
    short: 'How a value moved versus the previous period.',
    body: 'The difference between the latest period and the one before it. Shares, rates and scores are compared as a plain difference — in percentage points for percentages, otherwise in the indicator’s own unit (years, points); counts and money are compared in percent. Each entity is classified as improving, declining or stable. Stable band — see method note.',
  },
  {
    term: 'Percentage points',
    short: 'The plain difference between two percentages.',
    body: 'A share that goes from 10% to 12% has risen by 2 percentage points (pp) — and by 20% in relative terms. The two are not the same thing: BullDozer compares rates and shares in percentage points and counts and money in percent.',
  },
  {
    term: 'Median and mean',
    short: 'The middle country, and the average country.',
    body: 'The median is the middle value once the countries are sorted: half are above it, half below, and one extreme country does not move it. The mean adds every value and divides by how many there are, so an outlier pulls it towards itself. With an even number of countries the median is the average of the two middle values. Both are unweighted: each country counts once, whether it is Tuvalu or India. A population-weighted figure answers a different question — what is typical for a person rather than for a country.',
  },
  {
    term: 'Margin of error',
    short: 'How far a survey result may be from the true value.',
    body: 'A survey asks a sample, not everyone, and another sample would give a slightly different answer. For a share p from n respondents, the 95% margin of error is about 1.96 × √(p × (1 − p) ÷ n): ±3.1 percentage points for 50% of 1,000 people, ±6.2 for 250. Real surveys sample by area, so the true error is usually larger than this simple formula.',
  },
  {
    term: 'Confidence interval',
    short: 'The range a survey estimate most likely falls in.',
    body: 'The estimate plus and minus its margin of error — 42% ± 3 pp is 39% to 45%. A 95% interval is built by a method that catches the true value in 95 of 100 samples. Two results whose gap is smaller than their combined error are not shown to differ: neighbouring countries in a ranking are often statistically tied.',
  },
  {
    term: 'Forecast vs outturn',
    short: 'A projection is not a measured result.',
    body: 'An outturn is what was actually recorded for a year that has ended. A forecast or projection is an estimate for the current or a later year — IMF World Economic Outlook figures for those years are revised twice a year. BullDozer draws projected years dashed and leaves them out of trends.',
  },
  {
    term: 'Modelled vs measured',
    short: 'Counted from records, or estimated where records are missing.',
    body: 'Some figures are counted from registers and censuses; others are modelled where counts are missing or incomplete — WHO and UN mortality estimates often are. Modelled figures change when the model is revised and are smoothed over neighbouring years. Where the source grades its data, the dataset page says so.',
  },
  {
    term: 'Why there is no trend line',
    short: 'A straight line is drawn only when the series really moves one way.',
    body: 'A trend line appears only with at least 6 readings, a Mann–Kendall test with p < 0.05, and the same direction in the first and the second half of the series. A series that rises and then falls gets no line, because a single straight line would misdescribe it.',
  },
  {
    term: 'Group rollup',
    short: 'Aggregating entities into regions or categories.',
    body: 'Individual entities (countries, segments, brands) are summed into named groups. The group change is the average of member changes, which keeps large and small members comparable rather than letting one dominate the total.',
  },
  {
    term: 'Top movers',
    short: 'The biggest risers and fallers.',
    body: 'Entities ranked by their period-over-period change (a plain difference for shares, rates and scores — percentage points for percentages; percent for counts and money). Risers are positive moves, fallers negative. When the change is in percent, a move from a zero baseline is excluded, because a percentage change is undefined when the previous value is zero.',
  },
  {
    term: 'Real GDP growth',
    short: 'Inflation-adjusted change in economic output.',
    body: 'The annual percentage change in the value of all goods and services an economy produces, after stripping out price changes. Sourced from the IMF World Economic Outlook (indicator NGDP_RPCH).',
  },
  {
    term: 'CPI inflation',
    short: 'How fast consumer prices are rising.',
    body: 'The annual percentage change in the average price of a basket of consumer goods and services (Consumer Price Index). IMF DataMapper indicator PCPIPCH.',
  },
  {
    term: 'Net trust',
    short: 'Trust minus distrust in a survey.',
    body: 'In opinion surveys, the share who say they trust an institution. When both trust and distrust are reported, net trust is the trust share minus the distrust share — a single signed number that is easy to compare across markets.',
  },
  {
    term: 'Provenance',
    short: 'Where a number came from.',
    body: 'Every dataset carries its source, licence, unit and the date it was parsed. BullDozer only publishes public, parsed data and cites the original open source so any figure can be traced back.',
  },
];
