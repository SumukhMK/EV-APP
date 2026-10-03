package com.evrental.reference;

import com.evrental.common.ConflictException;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import com.evrental.reference.ReferenceResponses.FormOptionsResponse;
import com.evrental.reference.ReferenceResponses.HubResponse;
import com.evrental.reference.ReferenceResponses.ModelResponse;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Reads and adds the lists the forms offer.
 *
 * <p>Adding is deliberately cheap — an operator opening a new hub should not
 * wait for a developer — and there is no delete, only {@code active = false}.
 * A hub that closes still has to name the bikes that sat in it.
 */
@Service
public class ReferenceService {

    private final HubRepository hubs;
    private final VehicleModelRepository models;
    private final org.springframework.jdbc.core.JdbcTemplate jdbc;

    public ReferenceService(HubRepository hubs, VehicleModelRepository models,
                            org.springframework.jdbc.core.JdbcTemplate jdbc) {
        this.hubs = hubs;
        this.models = models;
        this.jdbc = jdbc;
    }

    /**
     * The curated lists, plus whatever the fleet is actually using.
     *
     * <p>The union matters because nothing except this module writes to these
     * tables. A bulk import creates bikes with a hub nobody has added — the
     * importer deliberately does not validate hubs, so a spreadsheet naming a
     * new one succeeds — and without the union that hub would exist on fifty
     * bikes and never appear in the dropdown an operator uses to find them.
     *
     * <p>An in-use value with no row of its own is returned with a null id:
     * it is a name the fleet uses, not a list entry somebody can retire.
     */
    @Transactional(readOnly = true)
    public FormOptionsResponse formOptions() {
        Map<String, HubResponse> hubsByName = new LinkedHashMap<>();
        hubs.findByActiveTrueOrderByNameAsc()
                .forEach(h -> hubsByName.put(h.getName().toLowerCase(), HubResponse.from(h)));
        for (String name : distinct("SELECT DISTINCT hub FROM vehicles WHERE hub IS NOT NULL")) {
            hubsByName.putIfAbsent(name.toLowerCase(), new HubResponse(null, name, true));
        }

        Map<String, ModelResponse> modelsByName = new LinkedHashMap<>();
        models.findByActiveTrueOrderByNameAsc()
                .forEach(m -> modelsByName.put(m.getName().toLowerCase(), ModelResponse.from(m)));
        for (String name : distinct("SELECT DISTINCT model FROM vehicles WHERE model IS NOT NULL")) {
            modelsByName.putIfAbsent(name.toLowerCase(), new ModelResponse(null, name, deriveMake(name), true));
        }

        return new FormOptionsResponse(
                hubsByName.values().stream()
                        .sorted(Comparator.comparing(HubResponse::name, String.CASE_INSENSITIVE_ORDER)).toList(),
                modelsByName.values().stream()
                        .sorted(Comparator.comparing(ModelResponse::name, String.CASE_INSENSITIVE_ORDER)).toList());
    }

    /** Tenant-scoped by RLS, like every other read. */
    private List<String> distinct(String sql) {
        return jdbc.queryForList(sql, String.class).stream()
                .filter(v -> v != null && !v.isBlank())
                .toList();
    }

    @Transactional
    public HubResponse addHub(UUID tenantId, String name) {
        String trimmed = name.trim();
        hubs.findByName(trimmed).ifPresent(existing -> {
            throw new ConflictException("A hub with this name already exists", "name");
        });
        Hub hub = new Hub();
        hub.setTenantId(tenantId);
        hub.setName(trimmed);
        return HubResponse.from(hubs.save(hub));
    }

    @Transactional
    public ModelResponse addModel(UUID tenantId, String name, String make) {
        String trimmed = name.trim();
        models.findByName(trimmed).ifPresent(existing -> {
            throw new ConflictException("A model with this name already exists", "name");
        });
        VehicleModel model = new VehicleModel();
        model.setTenantId(tenantId);
        model.setName(trimmed);
        // Same rule the frontend's deriveMake applies, so a model added here
        // and one added through a bulk import agree about its make.
        model.setMake(make == null || make.isBlank() ? deriveMake(trimmed) : make.trim());
        return ModelResponse.from(models.save(model));
    }

    /** "Eagle-SunM" is an e-Connects Eagle. The prefix is the make. */
    static String deriveMake(String model) {
        int dash = model.indexOf('-');
        String prefix = dash > 0 ? model.substring(0, dash) : model;
        return prefix.isBlank() ? model : prefix.trim();
    }
}
