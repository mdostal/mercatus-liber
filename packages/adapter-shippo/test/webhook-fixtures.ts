/**
 * A Shippo `track_updated` webhook body.
 *
 * The field names are from docs.goshippo.com/docs/tracking/webhooks/ (the
 * example body: `event`, `test`, `data` with `address_from`, `address_to`,
 * `carrier`, `eta`, `messages`, `metadata`, `original_eta`, `servicelevel`,
 * `tracking_history`, `tracking_number`, `tracking_status`, `transaction`) and
 * docs.goshippo.com/docs/tracking/tracking/ (the status object: `object_id`,
 * `object_created`, `object_updated`, `status`, `status_details`,
 * `status_date`, `substatus`, `location`; statuses `PRE_TRANSIT`, `TRANSIT`,
 * `DELIVERED`, `RETURNED`, `FAILURE`, `UNKNOWN`). Both were read on 2026-11-15
 * through a fetch tool that summarises the page instead of returning it
 * verbatim. The docs' example shows `transaction` only as a placeholder string.
 *
 * Every value is made up. This body was not captured from a live Shippo
 * delivery.
 */
export function shippoTrackUpdated(status: string, overrides: { transaction?: string | null; trackingNumber?: string; test?: boolean } = {}) {
  const statusObject = {
    object_created: "2026-11-14T16:00:00.000Z",
    object_updated: "2026-11-14T16:00:00.000Z",
    object_id: "status-0001",
    status,
    status_details: "Made-up status details.",
    status_date: "2026-11-14T15:45:00Z",
    substatus: null,
    location: { city: "Denver", state: "CO", zip: "80202", country: "US" },
  };
  return {
    event: "track_updated",
    test: overrides.test ?? false,
    data: {
      address_from: { city: "Austin", state: "TX", zip: "78701", country: "US" },
      address_to: { city: "Denver", state: "CO", zip: "80202", country: "US" },
      carrier: "usps",
      eta: "2026-11-15T00:00:00Z",
      original_eta: "2026-11-15T00:00:00Z",
      messages: [],
      metadata: "Order order-1001",
      servicelevel: { token: "usps_ground_advantage", name: "Ground Advantage" },
      tracking_number: overrides.trackingNumber ?? "TRACK-0001",
      tracking_status: statusObject,
      tracking_history: [statusObject],
      transaction: overrides.transaction === undefined ? "tx-0001" : overrides.transaction,
    },
  };
}
