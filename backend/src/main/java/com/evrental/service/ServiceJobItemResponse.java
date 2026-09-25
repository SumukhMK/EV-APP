package com.evrental.service;

/** One cost line, field-for-field against ServiceJobItem in the frontend contract. */
public record ServiceJobItemResponse(String label, long costPaise, ServiceJobItemKind kind) {

    public static ServiceJobItemResponse from(ServiceJobItem item) {
        return new ServiceJobItemResponse(item.getLabel(), item.getCostPaise(), item.getKind());
    }
}
