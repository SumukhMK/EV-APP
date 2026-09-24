package com.evrental.vehicle;

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
 * One bike in the registry.
 *
 * <p>There is deliberately no currentRiderId here. Vehicle.currentRiderId in
 * the frontend contract is a property of the open assignment, which S5 owns.
 * Storing it here too would be two copies of one fact, and they would drift
 * the first time an assignment closed without this row being updated.
 *
 * <p>state is never written directly. VehicleService.transitionState() is the
 * only thing that changes it -- see that method for why.
 */
@Entity
@Table(name = "vehicles")
public class Vehicle {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "registry_id", nullable = false)
    private String registryId;

    @Column(name = "chassis_number", nullable = false)
    private String chassisNumber;

    @Column(nullable = false)
    private String make;

    @Column(nullable = false)
    private String model;

    @Column(name = "battery_type", nullable = false)
    private String batteryType;

    @Column(name = "battery_vendor")
    private String batteryVendor;

    @Column(nullable = false)
    private String hub;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VehicleState state;

    @Column(name = "registration_number")
    private String registrationNumber;

    @Column(name = "motor_number")
    private String motorNumber;

    @Column(name = "controller_number")
    private String controllerNumber;

    @Column(name = "rfid_tag")
    private String rfidTag;

    @Column(name = "iot_number")
    private String iotNumber;

    @Column(name = "odometer_km")
    private Integer odometerKm;

    @Column(name = "inducted_on", nullable = false)
    private LocalDate inductedOn;

    @Column(name = "purchase_date")
    private LocalDate purchaseDate;

    @CreationTimestamp
    @Column(name = "created_on", nullable = false, updatable = false)
    private Instant createdOn;

    @UpdateTimestamp
    @Column(name = "updated_on", nullable = false)
    private Instant updatedOn;

    public UUID getId() {
        return id;
    }

    public UUID getTenantId() {
        return tenantId;
    }

    public void setTenantId(UUID tenantId) {
        this.tenantId = tenantId;
    }

    public String getRegistryId() {
        return registryId;
    }

    public void setRegistryId(String registryId) {
        this.registryId = registryId;
    }

    public String getChassisNumber() {
        return chassisNumber;
    }

    public void setChassisNumber(String chassisNumber) {
        this.chassisNumber = chassisNumber;
    }

    public String getMake() {
        return make;
    }

    public void setMake(String make) {
        this.make = make;
    }

    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    public String getBatteryType() {
        return batteryType;
    }

    public void setBatteryType(String batteryType) {
        this.batteryType = batteryType;
    }

    public String getBatteryVendor() {
        return batteryVendor;
    }

    public void setBatteryVendor(String batteryVendor) {
        this.batteryVendor = batteryVendor;
    }

    public String getHub() {
        return hub;
    }

    public void setHub(String hub) {
        this.hub = hub;
    }

    public VehicleState getState() {
        return state;
    }

    public void setState(VehicleState state) {
        this.state = state;
    }

    public String getRegistrationNumber() {
        return registrationNumber;
    }

    public void setRegistrationNumber(String registrationNumber) {
        this.registrationNumber = registrationNumber;
    }

    public String getMotorNumber() {
        return motorNumber;
    }

    public void setMotorNumber(String motorNumber) {
        this.motorNumber = motorNumber;
    }

    public String getControllerNumber() {
        return controllerNumber;
    }

    public void setControllerNumber(String controllerNumber) {
        this.controllerNumber = controllerNumber;
    }

    public String getRfidTag() {
        return rfidTag;
    }

    public void setRfidTag(String rfidTag) {
        this.rfidTag = rfidTag;
    }

    public String getIotNumber() {
        return iotNumber;
    }

    public void setIotNumber(String iotNumber) {
        this.iotNumber = iotNumber;
    }

    public Integer getOdometerKm() {
        return odometerKm;
    }

    public void setOdometerKm(Integer odometerKm) {
        this.odometerKm = odometerKm;
    }

    public LocalDate getInductedOn() {
        return inductedOn;
    }

    public void setInductedOn(LocalDate inductedOn) {
        this.inductedOn = inductedOn;
    }

    public LocalDate getPurchaseDate() {
        return purchaseDate;
    }

    public void setPurchaseDate(LocalDate purchaseDate) {
        this.purchaseDate = purchaseDate;
    }

    public Instant getCreatedOn() {
        return createdOn;
    }

    public Instant getUpdatedOn() {
        return updatedOn;
    }
}
