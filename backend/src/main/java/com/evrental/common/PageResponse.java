package com.evrental.common;

import java.util.List;
import org.springframework.data.domain.Page;

/**
 * The paged envelope every list endpoint returns.
 *
 * <p>This mirrors {@code Page<T>} in frontend/app/src/types/common.ts field for
 * field, which is the published API contract. Spring's own {@code Page}
 * serialises with different names ({@code number}, {@code numberOfElements},
 * plus a {@code pageable} block) and its JSON shape is explicitly unstable
 * across versions — so it is mapped here rather than returned raw.
 *
 * <p>No endpoint returns "all" (docs/BUILD.md).
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages) {

    public static <T> PageResponse<T> from(Page<T> page) {
        return new PageResponse<>(
                page.getContent(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }

    /** Maps the rows on the way out, so a controller can page entities and return DTOs. */
    public static <E, T> PageResponse<T> from(Page<E> page, java.util.function.Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
