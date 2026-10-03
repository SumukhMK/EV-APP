/**
 * The lists the forms offer: hubs and vehicle models.
 *
 * <p>Both were constants in the frontend's fixture file, imported directly
 * into three production forms. An operator whose hubs were not the four
 * demo ones could not add a bike, and the model list described a fixture
 * fleet rather than theirs.
 *
 * <p>These are reference data, not a schema: {@code vehicles.hub} and
 * {@code vehicles.model} stay free text and there is no foreign key. Retiring
 * a hub must not rewrite the bikes that sat in it, and a bulk import must not
 * fail because a spreadsheet names a hub nobody has added yet. The tables say
 * what to offer; they do not say what is allowed.
 */
package com.evrental.reference;
