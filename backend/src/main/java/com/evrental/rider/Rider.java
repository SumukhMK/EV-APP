package com.evrental.rider;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * One rider on the register.
 *
 * <p>There is deliberately no currentVehicleId here. Rider.currentVehicleId in
 * the frontend contract is a property of the open assignment, which S5 owns —
 * the same reasoning Vehicle.java applies to currentRiderId. Storing it here
 * too would be two copies of one fact, and they would drift the first time an
 * assignment closed without this row being updated.
 *
 * <p>paymentStatus is absent for the same reason: it is derived from the
 * current billing period, which S6's second half computes. The register
 * answers "PENDING" until then.
 *
 * <p>status is never written directly in S2 — a rider joins ACTIVE and nothing
 * changes it yet. S5's deboard and any future suspension/blacklist step will
 * be the doors, the way VehicleService.transitionState() is the only door to
 * a bike's state.
 *
 * <p>aadhaarEncrypted is the Aadhaar, encrypted at rest by AadhaarCipher
 * (AES-256-GCM, key from the AADHAAR_ENCRYPTION_KEY environment variable).
 * The register never returns it — RiderResponse has no such field — and
 * nothing reads it back until a KYC verification step needs to.
 */
@Entity
@Table(name = "riders")
public class Rider {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String phone;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private RiderStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "kyc_status", nullable = false)
    private KycStatus kycStatus;

    @Column(name = "plan_amount_paise", nullable = false)
    private long planAmountPaise;

    @Column(name = "deposit_held_paise", nullable = false)
    private long depositHeldPaise;

    @Enumerated(EnumType.STRING)
    @Column(name = "billing_day", nullable = false)
    private BillingDay billingDay;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_day", nullable = false)
    private PaymentDay paymentDay;

    @Enumerated(EnumType.STRING)
    @Column(name = "payment_mode", nullable = false)
    private PaymentMode paymentMode;

    @Column(nullable = false)
    private String platform;

    @Column(name = "onboarded_on", nullable = false)
    private LocalDate onboardedOn;

    @Column(name = "aadhaar_verified", nullable = false)
    private boolean aadhaarVerified;

    @Column(name = "primary_verified", nullable = false)
    private boolean primaryVerified;

    @Column(name = "whatsapp_verified", nullable = false)
    private boolean whatsappVerified;

    @Column(name = "alternate1_verified", nullable = false)
    private boolean alternate1Verified;

    @Column(name = "aadhaar_encrypted", nullable = false)
    private String aadhaarEncrypted;

    @CreationTimestamp
    @Column(name = "created_on", nullable = false, updatable = false)
    private Instant createdOn;

    @UpdateTimestamp
    @Column(name = "updated_on", nullable = false)
    private Instant updatedOn;


    // --- the onboarding answers V012 added -------------------------------
    //
    // Every one of these was validated by OnboardRiderRequest and then
    // discarded. Nullable because riders onboarded before V012 have none.

    @Column(name = "permanent_address")
    private String permanentAddress;

    @Column(name = "whatsapp_number")
    private String whatsappNumber;

    @Column(name = "alternate_number_1")
    private String alternateNumber1;

    @Column(name = "local_address")
    private String localAddress;

    @Column
    private String city;

    /** The state in the address. Named apart from {@code status} on purpose. */
    @Column(name = "state_name")
    private String stateName;

    @Column(name = "pin_code")
    private String pinCode;

    @Column(name = "location_coordinates")
    private String locationCoordinates;

    @Column(name = "pan_number")
    private String panNumber;

    @Column(name = "driving_licence")
    private String drivingLicence;

    @Column(name = "platform_rider_id")
    private String platformRiderId;

    /** What the rider actually handed over, against the planned deposit. */
    @Column(name = "deposit_paid_paise")
    private Long depositPaidPaise;

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public void setTenantId(UUID tenantId) {
        this.tenantId = tenantId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public RiderStatus getStatus() {
        return status;
    }

    public void setStatus(RiderStatus status) {
        this.status = status;
    }

    public KycStatus getKycStatus() {
        return kycStatus;
    }

    public void setKycStatus(KycStatus kycStatus) {
        this.kycStatus = kycStatus;
    }

    public long getPlanAmountPaise() {
        return planAmountPaise;
    }

    public void setPlanAmountPaise(long planAmountPaise) {
        this.planAmountPaise = planAmountPaise;
    }

    public long getDepositHeldPaise() {
        return depositHeldPaise;
    }

    public void setDepositHeldPaise(long depositHeldPaise) {
        this.depositHeldPaise = depositHeldPaise;
    }

    public BillingDay getBillingDay() {
        return billingDay;
    }

    public void setBillingDay(BillingDay billingDay) {
        this.billingDay = billingDay;
    }

    public PaymentDay getPaymentDay() {
        return paymentDay;
    }

    public void setPaymentDay(PaymentDay paymentDay) {
        this.paymentDay = paymentDay;
    }

    public PaymentMode getPaymentMode() {
        return paymentMode;
    }

    public void setPaymentMode(PaymentMode paymentMode) {
        this.paymentMode = paymentMode;
    }

    public String getPlatform() {
        return platform;
    }

    public void setPlatform(String platform) {
        this.platform = platform;
    }

    public LocalDate getOnboardedOn() {
        return onboardedOn;
    }

    public void setOnboardedOn(LocalDate onboardedOn) {
        this.onboardedOn = onboardedOn;
    }

    public boolean isAadhaarVerified() {
        return aadhaarVerified;
    }

    public void setAadhaarVerified(boolean aadhaarVerified) {
        this.aadhaarVerified = aadhaarVerified;
    }

    public boolean isPrimaryVerified() {
        return primaryVerified;
    }

    public void setPrimaryVerified(boolean primaryVerified) {
        this.primaryVerified = primaryVerified;
    }

    public boolean isWhatsappVerified() {
        return whatsappVerified;
    }

    public void setWhatsappVerified(boolean whatsappVerified) {
        this.whatsappVerified = whatsappVerified;
    }

    public boolean isAlternate1Verified() {
        return alternate1Verified;
    }

    public void setAlternate1Verified(boolean alternate1Verified) {
        this.alternate1Verified = alternate1Verified;
    }

    public String getAadhaarEncrypted() {
        return aadhaarEncrypted;
    }

    public void setAadhaarEncrypted(String aadhaarEncrypted) {
        this.aadhaarEncrypted = aadhaarEncrypted;
    }

    public Instant getCreatedOn() {
        return createdOn;
    }

    public Instant getUpdatedOn() {
        return updatedOn;
    }

    public String getPermanentAddress() {
        return permanentAddress;
    }

    public void setPermanentAddress(String permanentAddress) {
        this.permanentAddress = permanentAddress;
    }

    public String getWhatsappNumber() {
        return whatsappNumber;
    }

    public void setWhatsappNumber(String whatsappNumber) {
        this.whatsappNumber = whatsappNumber;
    }

    public String getAlternateNumber1() {
        return alternateNumber1;
    }

    public void setAlternateNumber1(String alternateNumber1) {
        this.alternateNumber1 = alternateNumber1;
    }

    public String getLocalAddress() {
        return localAddress;
    }

    public void setLocalAddress(String localAddress) {
        this.localAddress = localAddress;
    }

    public String getCity() {
        return city;
    }

    public void setCity(String city) {
        this.city = city;
    }

    public String getStateName() {
        return stateName;
    }

    public void setStateName(String stateName) {
        this.stateName = stateName;
    }

    public String getPinCode() {
        return pinCode;
    }

    public void setPinCode(String pinCode) {
        this.pinCode = pinCode;
    }

    public String getLocationCoordinates() {
        return locationCoordinates;
    }

    public void setLocationCoordinates(String locationCoordinates) {
        this.locationCoordinates = locationCoordinates;
    }

    public String getPanNumber() {
        return panNumber;
    }

    public void setPanNumber(String panNumber) {
        this.panNumber = panNumber;
    }

    public String getDrivingLicence() {
        return drivingLicence;
    }

    public void setDrivingLicence(String drivingLicence) {
        this.drivingLicence = drivingLicence;
    }

    public String getPlatformRiderId() {
        return platformRiderId;
    }

    public void setPlatformRiderId(String platformRiderId) {
        this.platformRiderId = platformRiderId;
    }

    public Long getDepositPaidPaise() {
        return depositPaidPaise;
    }

    public void setDepositPaidPaise(Long depositPaidPaise) {
        this.depositPaidPaise = depositPaidPaise;
    }
}
