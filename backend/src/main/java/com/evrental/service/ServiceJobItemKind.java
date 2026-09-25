package com.evrental.service;

/**
 * What a cost line is, matching ServiceJobItem['kind'] in
 * frontend/app/src/types/serviceJob.ts.
 *
 * <p>Parts and labour are separated because the two are read differently:
 * parts consumption feeds stock, labour feeds workshop capacity. OTHER is the
 * honest bucket for the rest rather than a wrong guess at one of the two.
 */
public enum ServiceJobItemKind {
    PART,
    LABOUR,
    OTHER
}
