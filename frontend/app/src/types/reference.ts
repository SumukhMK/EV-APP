/**
 * The tenant's own lists — the hubs it runs and the models it owns — as
 * `GET /reference/form-options` returns them. Field-for-field against
 * ReferenceResponses on the server.
 *
 * A retired entry stays in the list with `active: false` so an old vehicle
 * can still show where it was; the forms offer only the active ones.
 */
export interface HubOption {
  id: string;
  name: string;
  active: boolean;
}

export interface ModelOption {
  id: string;
  name: string;
  make: string;
  active: boolean;
}

export interface FormOptions {
  hubs: HubOption[];
  models: ModelOption[];
}
