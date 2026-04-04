/**
 * StravaLogo — renders the official Strava brand icon.
 *
 * Props:
 *   size   — icon size in dp (default 24)
 *   color  — icon colour (default Strava orange #FC4C02)
 */
import React from 'react';
import { FontAwesome5 } from '@expo/vector-icons';

export default function StravaLogo({ size = 24, color = '#FC4C02' }) {
  return <FontAwesome5 name="strava" size={size} color={color} accessibilityLabel="Strava" />;
}
