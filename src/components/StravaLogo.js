/**
 * StravaLogo — Renders the official Strava logo mark as an SVG.
 *
 * Props:
 *   size   — overall width/height in dp (default 24)
 *   color  — background fill colour (default Strava orange #FC4C02)
 */
import React from 'react';
import Svg, { Rect, G, Path } from 'react-native-svg';

export default function StravaLogo({ size = 24, color = '#FC4C02' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 16 16">
      <Rect width="16" height="16" rx="2" fill={color} />
      <G fill="#fff" fillRule="evenodd">
        <Path
          d="M6.9 8.8l2.5 4.5 2.4-4.5h-1.5l-.9 1.7-1-1.7z"
          opacity={0.6}
        />
        <Path d="M7.2 2.5l3.1 6.3H4zm0 3.8l1.2 2.5H5.9z" />
      </G>
    </Svg>
  );
}
