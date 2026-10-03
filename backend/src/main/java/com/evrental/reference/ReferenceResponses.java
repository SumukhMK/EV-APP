package com.evrental.reference;

/** The wire shapes for the two lists. */
public final class ReferenceResponses {

    private ReferenceResponses() {}

    public record HubResponse(String id, String name, boolean active) {
        static HubResponse from(Hub h) {
            return new HubResponse(h.getId().toString(), h.getName(), h.isActive());
        }
    }

    public record ModelResponse(String id, String name, String make, boolean active) {
        static ModelResponse from(VehicleModel m) {
            return new ModelResponse(m.getId().toString(), m.getName(), m.getMake(), m.isActive());
        }
    }

    /** What a form needs to render its two dropdowns, in one call. */
    public record FormOptionsResponse(java.util.List<HubResponse> hubs, java.util.List<ModelResponse> models) {}
}
