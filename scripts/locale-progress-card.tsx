export interface LocaleProgress {
  locale: string;
  name: string;
  percent: number;
}

interface LocaleProgressCardProps {
  rows: LocaleProgress[];
  total: number;
}

const WIDTH = 1120;
const ROW_HEIGHT = 58;
const FIRST_ROW_Y = 174;
const BAR_X = 610;
const BAR_WIDTH = 380;
const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif';

const COLORS = {
  panel: "#161b22",
  title: "#f0f6fc",
  muted: "#8b949e",
  name: "#e6edf3",
  percent: "#c9d1d9",
  track: "#30363d",
  fill: "#2da44e",
};

export const LocaleProgressCard = ({
  rows,
  total,
}: LocaleProgressCardProps): JSX.Element => {
  const height = FIRST_ROW_Y + 44 + rows.length * ROW_HEIGHT;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={WIDTH}
      height={height}
      viewBox={`0 0 ${WIDTH} ${height}`}
      font-family={FONT_FAMILY}
      role="img"
      aria-labelledby="title description"
    >
      <title id="title">Degoog locale translation progress</title>
      <desc id="description">
        {`Translation coverage across ${rows.length} locales, measured against ${total} English strings.`}
      </desc>
      <rect
        x="32"
        y="28"
        width={WIDTH - 64}
        height={height - 56}
        rx="12"
        fill={COLORS.panel}
      />
      <text x="70" y="82" fill={COLORS.title} font-size="25" font-weight="600">
        Locale translation progress
      </text>
      <text x="70" y="109" fill={COLORS.muted} font-size="14">
        {`${total} strings in en-US · ${rows.length} locales`}
      </text>
      <line
        x1="70"
        y1="137"
        x2={WIDTH - 70}
        y2="137"
        stroke={COLORS.track}
      />
      {rows.map((row, index) => {
        const y = FIRST_ROW_Y + index * ROW_HEIGHT;
        return (
          <g>
            <text
              x="82"
              y={y}
              fill={COLORS.name}
              font-size="15"
              font-weight="500"
            >
              {row.name}
            </text>
            <text x="82" y={y + 22} fill={COLORS.muted} font-size="12">
              {row.locale}
            </text>
            <rect
              x={BAR_X}
              y={y - 15}
              width={BAR_WIDTH}
              height="12"
              rx="6"
              fill={COLORS.track}
            />
            <rect
              x={BAR_X}
              y={y - 15}
              width={(BAR_WIDTH * row.percent) / 100}
              height="12"
              rx="6"
              fill={COLORS.fill}
            />
            <text
              x="1040"
              y={y - 4}
              fill={COLORS.percent}
              font-size="14"
              text-anchor="end"
              style="font-variant-numeric: tabular-nums"
            >
              {`${row.percent}%`}
            </text>
          </g>
        );
      })}
    </svg>
  );
};
