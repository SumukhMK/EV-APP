package com.evrental;

import static org.assertj.core.api.Assertions.assertThat;

import com.evrental.common.ApiErrorResponse;
import com.evrental.common.GlobalExceptionHandler;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * The one handler MockMvc cannot reach. The multipart size limit is enforced
 * by the servlet container while it parses the request, before Spring sees
 * it, and MockMvc has no container — so the handler is called directly. The
 * limit itself is in application.yml; what matters here is that going over
 * it reads as a sentence about the file and not as "Something went wrong".
 */
class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void aFileOverTheUploadLimitIs413WithAMessageAboutTheFile() {
        ResponseEntity<ApiErrorResponse> response =
                handler.tooLarge(new MaxUploadSizeExceededException(10L * 1024 * 1024));

        assertThat(response.getStatusCode().value()).isEqualTo(413);
        assertThat(response.getBody().message())
                .isEqualTo("The file is larger than 10 MB. Split it into smaller files.");
        assertThat(response.getBody().field()).isEqualTo("file");
    }
}
