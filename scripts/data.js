/* ═══════════════════════════════════════════
   DATA LAYER — live API
════════════════════════════════════════════ */

let API_BASE = 'https://api.badjupiter.cloud/ips/dashboard';

async function loadLocalConfig() {
  try {
    const res = await fetch('local.json');
    if (!res.ok) return;
    const cfg = await res.json();
    if (cfg.apiserver) {
      API_BASE = cfg.apiserver + '/ips/dashboard';
      console.log('[BadgerVision] Using local API server:', cfg.apiserver);
    }
  } catch (_) {
    // No local.json in production — that's fine
  }
}

let MACHINES = [];
let SERVICE_REPORTS = {};

function transformAPIResponse(data) {
  const machines = [];
  const reports = {};

  for (const [custId, custData] of Object.entries(data.customers || {})) {
    for (const [, locData] of Object.entries(custData.locations || {})) {
      for (const [unitUuid, unitData] of Object.entries(locData.units || {})) {
        const displayId = unitData.jp_machine_id || unitData.slug;

        machines.push({
          drive_folder_id:      locData.drive_folder_id || null,
          jp_machine_id:        displayId,
          customer_machine_id:  unitData.customer_machine_id || null,
          location_name:        locData.name,
          address_1:            locData.addr1,
          city:                 locData.city,
          state:                (locData.state || '').trim(),
          zip:                  locData.zip,
          genset_make:          unitData.genset_make    || '',
          genset_model:         unitData.genset_model   || '',
          genset_serial:        unitData.genset_serial  || '',
          genset_kw:            unitData.genset_size    || '',
          fuel_type:            unitData.fuel_type      || '',
          fuel_tank_size:       unitData.fuel_tank_size || '',
          engine_make:          unitData.engine_make    || '',
          engine_model:         unitData.engine_model   || '',
          engine_serial:        unitData.engine_serial  || '',
          battery_size:         unitData.battery        || '',
          management_status:    unitData.management_status || 'ACTIVE',
          has_verified_specs:   !!unitData.has_verified_specs,
          service_report_count: (unitData.reports || []).length,
          last_service_date:    unitData.last_service_date || null,
          last_verified_at:     unitData.last_verified_at  || null,
          customer_name:        custData.name,
          customer_id:          custId,
          // contact_ph / contact_mob = primary contact phone / mobile
          // amps / amps_mob = role TBD (mapped to ATOM contact for now)
          // biomed / biomed_mob = biomed contact name / mobile
          contacts: {
            atom:        unitData.amps        || '',
            atom_cell:   unitData.contact_ph  || '',
            atom_email:  unitData.contact_mob || '',
            biomed:      unitData.biomed      || '',
            biomed_cell: unitData.biomed_mob  || ''
          },
          unit_uuid: unitUuid,
          slug:      unitData.slug
        });

        if (unitData.reports && unitData.reports.length > 0) {
          reports[displayId] = unitData.reports;
        }
      }

      for (const unact of (locData.unactivated_units || [])) {
        machines.push({
          activated:       false,
          slug:            unact.slug,
          jp_machine_id:   unact.slug,
          location_name:   locData.name,
          address_1:       locData.addr1,
          city:            locData.city,
          state:           (locData.state || '').trim(),
          zip:             locData.zip,
          customer_name:   custData.name,
          customer_id:     custId,
          // Service reports can exist against a QR before a technician activates
          // the unit, so surface the count (and the reports themselves) anyway.
          management_status:    'PENDING',
          has_verified_specs:   false,
          service_report_count: (unact.reports || []).length,
          last_service_date:    unact.last_service_date || null,
        });

        if (unact.reports && unact.reports.length > 0) {
          reports[unact.slug] = unact.reports;
        }
      }
    }
  }

  return { machines, reports };
}

async function loadFleetData() {
  await loadLocalConfig();
  try {
    const userUuid = userProfile?.user?.uuid;
if (!userUuid) throw new Error('No user UUID available');
    const headers = { 'X-User-UUID': userUuid };
    const res = await fetch(API_BASE, { headers });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const { machines, reports } = transformAPIResponse(data);
    MACHINES = machines;
    SERVICE_REPORTS = reports;
    console.log('[BadgerVision] Raw API response:', data);
    console.log('[BadgerVision] Transformed machines (%d):', machines.length, machines);
    console.log('[BadgerVision] Service reports:', reports);
    return true;
  } catch (err) {
    console.error('Fleet data load failed:', err);
    return false;
  }
}

/* ═══════════════════════════════════════════
   PLACEHOLDER DATA (used for dev/fallback reference)
════════════════════════════════════════════ */

const _PLACEHOLDER_MACHINES = [
  {
    jp_machine_id: "FR-00001", customer_machine_id: "WLY-001",
    location_name: "881 Waverly", address_1: "881 Waverly Street",
    city: "Framingham", state: "MA", zip: "01702",
    genset_make: "Cummins", genset_model: "350DFCC", genset_serial: "11934143",
    genset_kw: "350", fuel_type: "Diesel", fuel_tank_size: "400",
    engine_make: "Cummins", engine_model: "QSB7", engine_serial: "79234523",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 8, last_service_date: "2026-03-26",
    last_verified_at: "2025-05-14T10:22:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Jane Smith", atom_cell: "555-123-4567", atom_email: "jsmith@fmc.com", biomed: "Bob Jones", biomed_cell: "555-987-6543" }
  },
  {
    jp_machine_id: "FR-00002", customer_machine_id: "WLY-002",
    location_name: "Framingham North", address_1: "245 Cochituate Road",
    city: "Framingham", state: "MA", zip: "01701",
    genset_make: "Generac", genset_model: "SG250", genset_serial: "GEN2298731",
    genset_kw: "250", fuel_type: "Natural Gas", fuel_tank_size: "N/A",
    engine_make: "Generac", engine_model: "OHVI", engine_serial: "44521187",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 5, last_service_date: "2026-01-14",
    last_verified_at: "2025-06-02T08:00:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Jane Smith", atom_cell: "555-123-4567", atom_email: "jsmith@fmc.com", biomed: "Tom Lee", biomed_cell: "555-444-2211" }
  },
  {
    jp_machine_id: "FR-00003", customer_machine_id: "LOW-001",
    location_name: "Lowell Dialysis Center", address_1: "14 Merrimack Street",
    city: "Lowell", state: "MA", zip: "01852",
    genset_make: "Kohler", genset_model: "400REOZT", genset_serial: "KOH4488221",
    genset_kw: "400", fuel_type: "Diesel", fuel_tank_size: "525",
    engine_make: "John Deere", engine_model: "6068HFG85", engine_serial: "JD987654",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 11, last_service_date: "2026-03-10",
    last_verified_at: "2025-04-20T14:30:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Maria Torres", atom_cell: "555-222-3344", atom_email: "mtorres@fmc.com", biomed: "Jim Walsh", biomed_cell: "555-667-8899" }
  },
  {
    jp_machine_id: "FR-00004", customer_machine_id: "BRK-007",
    location_name: "Brockton Renal", address_1: "500 Forest Avenue",
    city: "Brockton", state: "MA", zip: "02301",
    genset_make: "Cummins", genset_model: "150DFAA", genset_serial: "22134556",
    genset_kw: "150", fuel_type: "Diesel", fuel_tank_size: "200",
    engine_make: "Cummins", engine_model: "B3.9-G1", engine_serial: "B3994512",
    battery_size: "4D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 6, last_service_date: "2025-12-18",
    last_verified_at: "2025-03-15T11:00:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Paula Chen", atom_cell: "555-312-7890", atom_email: "pchen@fmc.com", biomed: "Gary Moss", biomed_cell: "555-200-4411" }
  },
  {
    jp_machine_id: "FR-00005", customer_machine_id: "SPR-012",
    location_name: "Springfield Dialysis", address_1: "1340 State Street",
    city: "Springfield", state: "MA", zip: "01109",
    genset_make: "Caterpillar", genset_model: "XQ350", genset_serial: "CAT8812334",
    genset_kw: "350", fuel_type: "Diesel", fuel_tank_size: "360",
    engine_make: "Caterpillar", engine_model: "C9", engine_serial: "CAT-ENG-0091",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: false,
    service_report_count: 2, last_service_date: "2025-11-07",
    last_verified_at: null,
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Alan Park", atom_cell: "555-744-0033", atom_email: "apark@fmc.com", biomed: "Donna Hill", biomed_cell: "555-190-5522" }
  },
  {
    jp_machine_id: "FR-00006", customer_machine_id: "WRC-004",
    location_name: "Worcester Central", address_1: "65 Lincoln Square",
    city: "Worcester", state: "MA", zip: "01608",
    genset_make: "Cummins", genset_model: "200DFGC", genset_serial: "33456712",
    genset_kw: "200", fuel_type: "Diesel", fuel_tank_size: "250",
    engine_make: "Cummins", engine_model: "QSB5.9", engine_serial: "QSB5918833",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 9, last_service_date: "2026-02-28",
    last_verified_at: "2025-07-10T09:00:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Sandra White", atom_cell: "555-881-2244", atom_email: "swhite@fmc.com", biomed: "Ken Brown", biomed_cell: "555-556-7711" }
  },
  {
    jp_machine_id: "FR-00007", customer_machine_id: "NHV-002",
    location_name: "New Haven Dialysis", address_1: "300 Orange Street",
    city: "New Haven", state: "CT", zip: "06510",
    genset_make: "MTU", genset_model: "12V2000 G65", genset_serial: "MTU229845",
    genset_kw: "500", fuel_type: "Diesel", fuel_tank_size: "660",
    engine_make: "MTU", engine_model: "12V2000", engine_serial: "MTU-ENG-7722",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 14, last_service_date: "2026-04-02",
    last_verified_at: "2025-08-22T13:45:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Luis Gomez", atom_cell: "860-334-5511", atom_email: "lgomez@fmc.com", biomed: "Rachel Kim", biomed_cell: "860-221-4400" }
  },
  {
    jp_machine_id: "DV-00001", customer_machine_id: "DAV-BOS-01",
    location_name: "DaVita Boston Harbor", address_1: "55 Northern Avenue",
    city: "Boston", state: "MA", zip: "02210",
    genset_make: "Kohler", genset_model: "150REOZJB", genset_serial: "KOH2255411",
    genset_kw: "150", fuel_type: "Diesel", fuel_tank_size: "175",
    engine_make: "John Deere", engine_model: "4045HF120", engine_serial: "JD441122",
    battery_size: "4D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 4, last_service_date: "2026-01-22",
    last_verified_at: "2025-09-05T10:00:00Z",
    customer_name: "DaVita Dialysis", customer_id: "cust-002",
    contacts: { atom: "Chris O'Malley", atom_cell: "617-555-1001", atom_email: "comalley@davita.com", biomed: "Vera Santos", biomed_cell: "617-555-2002" }
  },
  {
    jp_machine_id: "DV-00002", customer_machine_id: "DAV-CAM-01",
    location_name: "DaVita Cambridge", address_1: "1 Cambridge Center",
    city: "Cambridge", state: "MA", zip: "02142",
    genset_make: "Generac", genset_model: "SG130", genset_serial: "GEN7765441",
    genset_kw: "130", fuel_type: "Natural Gas", fuel_tank_size: "N/A",
    engine_make: "Generac", engine_model: "OHVI", engine_serial: "GEN-ENG-3344",
    battery_size: "4D", management_status: "ACTIVE", has_verified_specs: false,
    service_report_count: 1, last_service_date: "2025-10-15",
    last_verified_at: null,
    customer_name: "DaVita Dialysis", customer_id: "cust-002",
    contacts: { atom: "Patricia Hull", atom_cell: "617-555-3003", atom_email: "phull@davita.com", biomed: "Ravi Patel", biomed_cell: "617-555-4004" }
  },
  {
    jp_machine_id: "DV-00003", customer_machine_id: "DAV-SOM-01",
    location_name: "DaVita Somerville", address_1: "371 Highland Avenue",
    city: "Somerville", state: "MA", zip: "02144",
    genset_make: "Cummins", genset_model: "100DFBB", genset_serial: "CUM100-4412",
    genset_kw: "100", fuel_type: "Diesel", fuel_tank_size: "120",
    engine_make: "Cummins", engine_model: "4BT3.9", engine_serial: "4BT99012",
    battery_size: "4D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 3, last_service_date: "2026-02-05",
    last_verified_at: "2025-10-01T08:30:00Z",
    customer_name: "DaVita Dialysis", customer_id: "cust-002",
    contacts: { atom: "Tim Burke", atom_cell: "617-555-5005", atom_email: "tburke@davita.com", biomed: "Nicole Tran", biomed_cell: "617-555-6006" }
  },
  {
    jp_machine_id: "UR-00001", customer_machine_id: "USRC-QNY-01",
    location_name: "US Renal Care Queens", address_1: "9207 Queens Blvd",
    city: "Elmhurst", state: "NY", zip: "11373",
    genset_make: "Cummins", genset_model: "275DFCD", genset_serial: "CUM275-9981",
    genset_kw: "275", fuel_type: "Diesel", fuel_tank_size: "330",
    engine_make: "Cummins", engine_model: "6CTA8.3-G2", engine_serial: "6CTA112233",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 7, last_service_date: "2026-04-08",
    last_verified_at: "2025-11-18T15:20:00Z",
    customer_name: "US Renal Care", customer_id: "cust-003",
    contacts: { atom: "Diana Ross", atom_cell: "718-555-7700", atom_email: "dross@usrc.com", biomed: "Ahmed Hassan", biomed_cell: "718-555-8811" }
  },
  {
    jp_machine_id: "FR-00008", customer_machine_id: "FIT-003",
    location_name: "Fitchburg Dialysis", address_1: "120 Prichard Street",
    city: "Fitchburg", state: "MA", zip: "01420",
    genset_make: "Cummins", genset_model: "175DFAA", genset_serial: "CUM175-5523",
    genset_kw: "175", fuel_type: "Diesel", fuel_tank_size: "200",
    engine_make: "Cummins", engine_model: "B3.9-G5", engine_serial: "B3G5-8812",
    battery_size: "4D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 5, last_service_date: "2026-01-30",
    last_verified_at: "2025-06-29T10:00:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Wendy Cole", atom_cell: "978-555-1122", atom_email: "wcole@fmc.com", biomed: "Phil Adams", biomed_cell: "978-555-3344" }
  },
  {
    jp_machine_id: "FR-00009", customer_machine_id: "QNC-001",
    location_name: "Quincy Center Renal", address_1: "25 Cottage Avenue",
    city: "Quincy", state: "MA", zip: "02169",
    genset_make: "Generac", genset_model: "SG200", genset_serial: "GEN200-7743",
    genset_kw: "200", fuel_type: "Natural Gas", fuel_tank_size: "N/A",
    engine_make: "Generac", engine_model: "OHVI-6.8L", engine_serial: "GEN-6.8-4411",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: false,
    service_report_count: 0, last_service_date: null,
    last_verified_at: null,
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Steve Nolan", atom_cell: "617-555-9988", atom_email: "snolan@fmc.com", biomed: "Betty Ford", biomed_cell: "617-555-7766" }
  },
  {
    jp_machine_id: "FR-00010", customer_machine_id: "MED-019",
    location_name: "Medford Dialysis", address_1: "44 Salem Street",
    city: "Medford", state: "MA", zip: "02155",
    genset_make: "Kohler", genset_model: "200REOZJB", genset_serial: "KOH200-1133",
    genset_kw: "200", fuel_type: "Diesel", fuel_tank_size: "260",
    engine_make: "John Deere", engine_model: "6068HF275", engine_serial: "JD6068-9923",
    battery_size: "8D", management_status: "ACTIVE", has_verified_specs: true,
    service_report_count: 6, last_service_date: "2026-03-14",
    last_verified_at: "2025-07-31T12:00:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Cathy Bloom", atom_cell: "781-555-6622", atom_email: "cbloom@fmc.com", biomed: "Howard Grant", biomed_cell: "781-555-4433" }
  },
  {
    jp_machine_id: "FR-00011", customer_machine_id: "PTT-005",
    location_name: "Pittsfield Renal", address_1: "77 North Street",
    city: "Pittsfield", state: "MA", zip: "01201",
    genset_make: "Caterpillar", genset_model: "C18", genset_serial: "CAT-C18-4412",
    genset_kw: "600", fuel_type: "Diesel", fuel_tank_size: "750",
    engine_make: "Caterpillar", engine_model: "C18", engine_serial: "CAT-C18ENG-7733",
    battery_size: "8D", management_status: "NO LONGER MANAGED", has_verified_specs: true,
    service_report_count: 3, last_service_date: "2024-09-22",
    last_verified_at: "2024-08-10T09:00:00Z",
    customer_name: "Fresenius Medical Care", customer_id: "cust-001",
    contacts: { atom: "Margaret Liu", atom_cell: "413-555-2211", atom_email: "mliu@fmc.com", biomed: "Owen Carey", biomed_cell: "413-555-9988" }
  }
];

const _PLACEHOLDER_SERVICE_REPORTS = {
  "FR-00001": [
    {
      report_id: "rpt-20260326-001", service_date: "2026-03-26",
      service_type: "Major PM", subcontractor_name: "Hawkins Power Solutions",
      technician_name: "Derek Hawkins", job_number: "HP-4421",
      hour_meter_reading: 604.2, fuel_level: "3/4",
      deficiencies_noted: false,
      technician_comments: "Performed major PM per Cummins spec. Changed oil (15W-40), filters, coolant test, load bank test passed at 100% for 2 hours. Unit in excellent condition.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20260326-001.pdf",
      ingested_at: "2026-03-27T08:00:00Z"
    },
    {
      report_id: "rpt-20250611-001", service_date: "2025-06-11",
      service_type: "Major PM", subcontractor_name: "Weld Power Generator",
      technician_name: "Brandon Hippert", job_number: "241354",
      hour_meter_reading: 527.8, fuel_level: "Full",
      deficiencies_noted: true,
      technician_comments: "Performed major PM. Unit started but shut down after 10 seconds for Low AC Voltage alarm. Recommend further evaluation of AVR and voltage regulator. Load bank test not completed due to fault condition.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20250611-001.pdf",
      ingested_at: "2025-06-12T09:15:00Z"
    },
    {
      report_id: "rpt-20250214-001", service_date: "2025-02-14",
      service_type: "Minor PM", subcontractor_name: "Weld Power Generator",
      technician_name: "Brandon Hippert", job_number: "238877",
      hour_meter_reading: 498.1, fuel_level: "Full",
      deficiencies_noted: false,
      technician_comments: "Performed minor PM. Checked all fluid levels, battery voltage 12.8V, exercised unit 30 minutes — passed. No issues noted.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20250214-001.pdf",
      ingested_at: "2025-02-15T10:00:00Z"
    },
    {
      report_id: "rpt-20241005-001", service_date: "2024-10-05",
      service_type: "Break Fix", subcontractor_name: "Weld Power Generator",
      technician_name: "Mike Torres", job_number: "235620",
      hour_meter_reading: 471.5, fuel_level: "1/2",
      deficiencies_noted: true,
      technician_comments: "Responded to battery fault alarm. Replaced both batteries (8D, 900CCA). Unit returned to auto. Recommend scheduling major PM within 30 days.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20241005-001.pdf",
      ingested_at: "2024-10-06T11:30:00Z"
    },
    {
      report_id: "rpt-20240711-001", service_date: "2024-07-11",
      service_type: "Major PM", subcontractor_name: "Weld Power Generator",
      technician_name: "Brandon Hippert", job_number: "231990",
      hour_meter_reading: 445.0, fuel_level: "Full",
      deficiencies_noted: false,
      technician_comments: "Annual major PM completed. All fluids changed, coolant tested, load bank test 2 hours at 100% load — passed. Unit in good condition.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20240711-001.pdf",
      ingested_at: "2024-07-12T08:45:00Z"
    },
    {
      report_id: "rpt-20240315-001", service_date: "2024-03-15",
      service_type: "Refuel", subcontractor_name: "Bay State Fuel",
      technician_name: "Dispatch", job_number: "BSF-9932",
      hour_meter_reading: 445.0, fuel_level: "Full",
      deficiencies_noted: false,
      technician_comments: "Delivered 280 gallons diesel. Tank at 30% prior to delivery.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20240315-001.pdf",
      ingested_at: "2024-03-15T16:00:00Z"
    },
    {
      report_id: "rpt-20231228-001", service_date: "2023-12-28",
      service_type: "Minor PM", subcontractor_name: "Weld Power Generator",
      technician_name: "Brandon Hippert", job_number: "228441",
      hour_meter_reading: 410.3, fuel_level: "3/4",
      deficiencies_noted: false,
      technician_comments: "Minor PM completed. All checks passed. Unit running well.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20231228-001.pdf",
      ingested_at: "2023-12-29T09:00:00Z"
    },
    {
      report_id: "rpt-20230622-001", service_date: "2023-06-22",
      service_type: "Major PM", subcontractor_name: "Weld Power Generator",
      technician_name: "Jim Fallon", job_number: "224100",
      hour_meter_reading: 378.0, fuel_level: "Full",
      deficiencies_noted: false,
      technician_comments: "Major PM completed. Oil, filters, coolant replaced. Load bank 2 hours at 100% — passed. Unit in excellent condition.",
      pdf_url: "https://storage.badjupiter.cloud/ips/reports/rpt-20230622-001.pdf",
      ingested_at: "2023-06-23T07:30:00Z"
    }
  ]
};
