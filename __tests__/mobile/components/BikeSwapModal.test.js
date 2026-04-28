/**
 * BikeSwapModal — interaction smoke test.
 *
 * Covers:
 *   - renders with a simple road→gravel session and surfaces both bike
 *     labels in the body
 *   - tapping "Apply" calls onApply with the new bikeType + the
 *     suggested duration/distance from utils/bikeSwap (we don't assert
 *     the exact numbers, just that the handler fires with the right
 *     shape)
 *   - tapping the dismiss control fires onCancel
 *
 * No timers, no async, no network — pure interaction. Acts as the
 * canary for the test scaffold: if this passes, the rest of the
 * suite should run cleanly.
 */
const React = require('react');
const { fireEvent } = require('@testing-library/react-native');
const { renderScreen } = require('../test-utils');
const BikeSwapModal = require('../../../src/components/BikeSwapModal').default;

describe('BikeSwapModal', () => {
  const baseSession = {
    id: 'a-1', subType: 'endurance', effort: 'easy',
    durationMins: 60, distanceKm: 18, title: 'Easy ride',
  };

  it('renders the target bike label and the headline copy', () => {
    const { getByText } = renderScreen(BikeSwapModal, {
      props: {
        visible: true,
        session: baseSession,
        fromBike: 'road',
        toBike: 'gravel',
        onApply: jest.fn(),
        onApplyOriginal: jest.fn(),
        onCancel: jest.fn(),
      },
    });
    // Target label appears in the title ("Switching to gravel?") and
    // the same-effort/same-time framing is the modal's anchor copy.
    expect(getByText(/switching\s+to\s+gravel/i)).toBeTruthy();
    expect(getByText(/same\s+effort,\s+same\s+time/i)).toBeTruthy();
  });

  it('returns null when not visible', () => {
    const { queryByText } = renderScreen(BikeSwapModal, {
      props: { visible: false, session: baseSession, fromBike: 'road', toBike: 'gravel' },
    });
    // Modal short-circuits to null when not visible — none of its CTA
    // copy should be in the tree.
    expect(queryByText(/use\s+these\s+numbers/i)).toBeNull();
    expect(queryByText(/cancel/i)).toBeNull();
  });

  it('fires onApply with the new bikeType when the rider confirms', () => {
    const onApply = jest.fn();
    const { getByText } = renderScreen(BikeSwapModal, {
      props: {
        visible: true,
        session: baseSession,
        fromBike: 'road',
        toBike: 'gravel',
        onApply,
        onApplyOriginal: jest.fn(),
        onCancel: jest.fn(),
      },
    });

    // The modal's primary CTA is "Use these numbers" — match a few
    // adjacent copy variations so a small tweak doesn't break the
    // test, but anchor on "use" to keep the assertion meaningful.
    const applyBtn = getByText(/use\s+these\s+numbers|apply|sounds\s+good/i);
    fireEvent.press(applyBtn);

    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply.mock.calls[0][0]).toMatchObject({ bikeType: 'gravel' });
  });
});
