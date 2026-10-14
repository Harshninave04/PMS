import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { RegisterNewPatientButton } from "@/components/admissions/register-new-patient-button";

test("register new patient button is rendered", () => {
    const markup = renderToStaticMarkup(
        React.createElement(RegisterNewPatientButton, { onClick: () => undefined })
    );

    assert.match(markup, /Register New Patient/);
    assert.match(markup, /<button[^>]*type="button"/);
});
