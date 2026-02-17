## MODIFIED Requirements

### Requirement: Export and Import buttons are wired to their implementations

The Admin tab SHALL render an "Export Mappings" button and an "Import Mappings" button
at the bottom of the Admin panel. Both buttons SHALL be fully functional:
- "Export Mappings" SHALL trigger the export flow defined in the `export-import` spec.
- "Import Mappings" SHALL trigger the import flow defined in the `export-import` spec.

Neither button SHALL be a no-op. The placeholder behaviour from Phase 5 is replaced.

#### Scenario: Export and Import buttons are visible and functional
- **WHEN** the user views the Admin tab
- **THEN** both "Export Mappings" and "Import Mappings" buttons are visible in the UI
- **AND** clicking "Export Mappings" initiates a file download
- **AND** clicking "Import Mappings" opens a file picker
