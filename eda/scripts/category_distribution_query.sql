WITH nfhs_norm AS (
  SELECT
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(state_ut, '&', 'AND'))), '\\s+', ' ') AS state_norm_raw,
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(REPLACE(district_name, '&', 'AND'), '-', ' '))), '\\s+', ' ') AS district_norm_raw,
    institutional_birth_5y_pct AS institutional_birth,
    child_u5_who_are_stunted_height_for_age_18_pct AS stunting
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.nfhs_5_district_health_indicators
),
state_alias(nfhs_state_norm, canonical_state_norm) AS (
  VALUES
    ('MAHARASTRA', 'MAHARASHTRA'),
    ('NCT OF DELHI', 'DELHI'),
    ('DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU')
),
district_alias(nfhs_state_norm, nfhs_district_norm, canonical_state_norm, canonical_district_norm) AS (
  VALUES
    ('ANDAMAN AND NICOBAR ISLANDS', 'SOUTH ANDAMAN', 'ANDAMAN AND NICOBAR ISLANDS', 'SOUTH ANDAMANS'),
    ('ANDHRA PRADESH', 'VISAKHAPATNAM', 'ANDHRA PRADESH', 'VISAKHAPATANAM'),
    ('BIHAR', 'PURBA CHAMPARAN', 'BIHAR', 'PURBI CHAMPARAN'),
    ('CHHATTISGARH', 'KODAGAON', 'CHHATTISGARH', 'KONDAGAON'),
    ('DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DADRA AND NAGAR HAVELI', 'THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DADRA AND NAGAR HAVELI'),
    ('DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DAMAN', 'THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DAMAN'),
    ('DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DIU', 'THE DADRA AND NAGAR HAVELI AND DAMAN AND DIU', 'DIU'),
    ('HARYANA', 'CHARKHI DADRI', 'HARYANA', 'CHARKI DADRI'),
    ('JAMMU AND KASHMIR', 'BARAMULA', 'JAMMU AND KASHMIR', 'BARAMULLA'),
    ('KARNATAKA', 'CHAMARAJANAGAR', 'KARNATAKA', 'CHAMARAJANAGARA'),
    ('KARNATAKA', 'DAVANAGERE', 'KARNATAKA', 'DAVANGERE'),
    ('MAHARASTRA', 'AHMADNAGAR', 'MAHARASHTRA', 'AHMEDNAGAR'),
    ('MAHARASTRA', 'AKOLA', 'MAHARASHTRA', 'AKOLA'),
    ('MAHARASTRA', 'AMRAVATI', 'MAHARASHTRA', 'AMRAVATI'),
    ('MAHARASTRA', 'AURANGABAD', 'MAHARASHTRA', 'AURANGABAD'),
    ('MAHARASTRA', 'BHANDARA', 'MAHARASHTRA', 'BHANDARA'),
    ('MAHARASTRA', 'BULDANA', 'MAHARASHTRA', 'BULDHANA'),
    ('MAHARASTRA', 'CHANDRAPUR', 'MAHARASHTRA', 'CHANDRAPUR'),
    ('MAHARASTRA', 'DHULE', 'MAHARASHTRA', 'DHULE'),
    ('MAHARASTRA', 'GADCHIROLI', 'MAHARASHTRA', 'GADCHIROLI'),
    ('MAHARASTRA', 'GONDIYA', 'MAHARASHTRA', 'GONDIA'),
    ('MAHARASTRA', 'HINGOLI', 'MAHARASHTRA', 'HINGOLI'),
    ('MAHARASTRA', 'JALGAON', 'MAHARASHTRA', 'JALGAON'),
    ('MAHARASTRA', 'JALNA', 'MAHARASHTRA', 'JALNA'),
    ('MAHARASTRA', 'KOLHAPUR', 'MAHARASHTRA', 'KOLHAPUR'),
    ('MAHARASTRA', 'LATUR', 'MAHARASHTRA', 'LATUR'),
    ('MAHARASTRA', 'MUMBAI', 'MAHARASHTRA', 'MUMBAI'),
    ('MAHARASTRA', 'MUMBAI SUBURBAN', 'MAHARASHTRA', 'MUMBAI SUBURBAN'),
    ('MAHARASTRA', 'NAGPUR', 'MAHARASHTRA', 'NAGPUR'),
    ('MAHARASTRA', 'NANDED', 'MAHARASHTRA', 'NANDED'),
    ('MAHARASTRA', 'NANDURBAR', 'MAHARASHTRA', 'NANDURBAR'),
    ('MAHARASTRA', 'NASHIK', 'MAHARASHTRA', 'NASHIK'),
    ('MAHARASTRA', 'OSMANABAD', 'MAHARASHTRA', 'OSMANABAD'),
    ('MAHARASTRA', 'PALGHAR', 'MAHARASHTRA', 'PALGHAR'),
    ('MAHARASTRA', 'PARBHANI', 'MAHARASHTRA', 'PARBHANI'),
    ('MAHARASTRA', 'PUNE', 'MAHARASHTRA', 'PUNE'),
    ('MAHARASTRA', 'RATNAGIRI', 'MAHARASHTRA', 'RATNAGIRI'),
    ('MAHARASTRA', 'SANGLI', 'MAHARASHTRA', 'SANGLI'),
    ('MAHARASTRA', 'SATARA', 'MAHARASHTRA', 'SATARA'),
    ('MAHARASTRA', 'SINDHUDURG', 'MAHARASHTRA', 'SINDHUDURG'),
    ('MAHARASTRA', 'SOLAPUR', 'MAHARASHTRA', 'SOLAPUR'),
    ('MAHARASTRA', 'THANE', 'MAHARASHTRA', 'THANE'),
    ('MAHARASTRA', 'WARDHA', 'MAHARASHTRA', 'WARDHA'),
    ('MAHARASTRA', 'WASHIM', 'MAHARASHTRA', 'WASHIM'),
    ('MAHARASTRA', 'YAVATMAL', 'MAHARASHTRA', 'YAVATMAL'),
    ('MEGHALAYA', 'EAST JANTIA HILLS', 'MEGHALAYA', 'EAST JAINTIA HILLS'),
    ('MEGHALAYA', 'RIBHOI', 'MEGHALAYA', 'RI BHOI'),
    ('NCT OF DELHI', 'CENTRAL', 'DELHI', 'CENTRAL'),
    ('NCT OF DELHI', 'EAST', 'DELHI', 'EAST'),
    ('NCT OF DELHI', 'NEW DELHI', 'DELHI', 'NEW DELHI'),
    ('NCT OF DELHI', 'NORTH', 'DELHI', 'NORTH'),
    ('NCT OF DELHI', 'NORTH EAST', 'DELHI', 'NORTH EAST'),
    ('NCT OF DELHI', 'NORTH WEST', 'DELHI', 'NORTH WEST'),
    ('NCT OF DELHI', 'SHAHDARA', 'DELHI', 'SHAHDARA'),
    ('NCT OF DELHI', 'SOUTH', 'DELHI', 'SOUTH'),
    ('NCT OF DELHI', 'SOUTH EAST', 'DELHI', 'SOUTH EAST'),
    ('NCT OF DELHI', 'SOUTH WEST', 'DELHI', 'SOUTH WEST'),
    ('NCT OF DELHI', 'WEST', 'DELHI', 'WEST'),
    ('ODISHA', 'NABARANGAPUR', 'ODISHA', 'NABARANGPUR'),
    ('PUNJAB', 'FIROZPUR', 'PUNJAB', 'FIROZEPUR'),
    ('RAJASTHAN', 'JALOR', 'RAJASTHAN', 'JALORE'),
    ('RAJASTHAN', 'JHUNJHUNUN', 'RAJASTHAN', 'JHUNJHUNU'),
    ('TAMIL NADU', 'VILUPPURAM', 'TAMIL NADU', 'VILLUPURAM'),
    ('TELANGANA', 'KOMARAM BHEEM ASIFABAD', 'TELANGANA', 'KUMURAM BHEEM ASIFABAD'),
    ('UTTAR PRADESH', 'BARA BANKI', 'UTTAR PRADESH', 'BARABANKI'),
    ('UTTAR PRADESH', 'KUSHINAGAR', 'UTTAR PRADESH', 'KUSHI NAGAR'),
    ('UTTAR PRADESH', 'MAHRAJGANJ', 'UTTAR PRADESH', 'MAHARAJGANJ'),
    ('UTTAR PRADESH', 'SANT KABIR NAGAR', 'UTTAR PRADESH', 'SANT KABEER NAGAR'),
    ('UTTAR PRADESH', 'SIDDHARTHNAGAR', 'UTTAR PRADESH', 'SIDDHARTH NAGAR'),
    ('UTTARAKHAND', 'HARDWAR', 'UTTARAKHAND', 'HARIDWAR'),
    ('UTTARAKHAND', 'RUDRAPRAYAG', 'UTTARAKHAND', 'RUDRA PRAYAG'),
    ('UTTARAKHAND', 'UDHAM SINGH NAGAR', 'UTTARAKHAND', 'UDAM SINGH NAGAR'),
    ('UTTARAKHAND', 'UTTARKASHI', 'UTTARAKHAND', 'UTTAR KASHI'),
    ('WEST BENGAL', 'PASCHIM BARDDHAMAN', 'WEST BENGAL', 'PASCHIM BARDHAMAN'),
    ('WEST BENGAL', 'PURULIYA', 'WEST BENGAL', 'PURULIA'),
    ('ANDHRA PRADESH', 'SRI POTTI SRIRAMULU NELLO', 'ANDHRA PRADESH', 'SPSR NELLORE'),
    ('ASSAM', 'KAMRUP METROPOLITAN', 'ASSAM', 'KAMRUP METRO'),
    ('ASSAM', 'MORIGAON', 'ASSAM', 'MARIGAON'),
    ('CHHATTISGARH', 'KABEERDHAM', 'CHHATTISGARH', 'KABIRDHAM'),
    ('CHHATTISGARH', 'KORIYA', 'CHHATTISGARH', 'KOREA'),
    ('CHHATTISGARH', 'UTTAR BASTAR KANKER', 'CHHATTISGARH', 'KANKER'),
    ('GUJARAT', 'ARAVALI', 'GUJARAT', 'ARVALLI'),
    ('GUJARAT', 'CHHOTA UDAIPUR', 'GUJARAT', 'CHHOTAUDEPUR'),
    ('GUJARAT', 'THE DANGS', 'GUJARAT', 'DANG'),
    ('HARYANA', 'GURGAON', 'HARYANA', 'GURUGRAM'),
    ('HARYANA', 'MEWAT', 'HARYANA', 'NUH'),
    ('JAMMU AND KASHMIR', 'BADGAM', 'JAMMU AND KASHMIR', 'BUDGAM'),
    ('JAMMU AND KASHMIR', 'BANDIPORE', 'JAMMU AND KASHMIR', 'BANDIPORA'),
    ('JAMMU AND KASHMIR', 'PUNCH', 'JAMMU AND KASHMIR', 'POONCH'),
    ('JAMMU AND KASHMIR', 'SHUPIYAN', 'JAMMU AND KASHMIR', 'SHOPIAN'),
    ('JHARKHAND', 'KODARMA', 'JHARKHAND', 'KODERMA'),
    ('JHARKHAND', 'PASHCHIMI SINGHBHUM', 'JHARKHAND', 'WEST SINGHBHUM'),
    ('JHARKHAND', 'PURBI SINGHBHUM', 'JHARKHAND', 'EAST SINGHBUM'),
    ('JHARKHAND', 'SAHIBGANJ', 'JHARKHAND', 'SAHEBGANJ'),
    ('KARNATAKA', 'BANGALORE', 'KARNATAKA', 'BENGALURU URBAN'),
    ('KARNATAKA', 'BANGALORE RURAL', 'KARNATAKA', 'BENGALURU RURAL'),
    ('KARNATAKA', 'BELGAUM', 'KARNATAKA', 'BELAGAVI'),
    ('KARNATAKA', 'BELLARY', 'KARNATAKA', 'BALLARI'),
    ('KARNATAKA', 'BIJAPUR', 'KARNATAKA', 'VIJAYAPURA'),
    ('KARNATAKA', 'CHIKMAGALUR', 'KARNATAKA', 'CHIKKAMAGALURU'),
    ('KARNATAKA', 'GULBARGA', 'KARNATAKA', 'KALABURAGI'),
    ('KARNATAKA', 'MYSORE', 'KARNATAKA', 'MYSURU'),
    ('KARNATAKA', 'SHIMOGA', 'KARNATAKA', 'SHIVAMOGGA'),
    ('KARNATAKA', 'TUMKUR', 'KARNATAKA', 'TUMAKURU'),
    ('LADAKH', 'LEH(LADAKH)', 'LADAKH', 'LEH LADAKH'),
    ('LAKSHADWEEP', 'LAKSHADWEEP', 'LAKSHADWEEP', 'LAKSHADWEEP DISTRICT'),
    ('MADHYA PRADESH', 'KHANDWA (EAST NIMAR)', 'MADHYA PRADESH', 'EAST NIMAR'),
    ('MADHYA PRADESH', 'KHARGONE (WEST NIMAR)', 'MADHYA PRADESH', 'KHARGONE'),
    ('MADHYA PRADESH', 'NARSIMHAPUR', 'MADHYA PRADESH', 'NARSINGHPUR'),
    ('MAHARASTRA', 'BID', 'MAHARASHTRA', 'BEED'),
    ('MAHARASTRA', 'RAIGARH', 'MAHARASHTRA', 'RAIGAD'),
    ('MIZORAM', 'CHANDEL', 'MANIPUR', 'CHANDEL'),
    ('ODISHA', 'BAUDH', 'ODISHA', 'BOUDH'),
    ('ODISHA', 'DEBAGARH', 'ODISHA', 'DEOGARH'),
    ('ODISHA', 'SUBARNAPUR', 'ODISHA', 'SONEPUR'),
    ('PUDUCHERRY', 'PUDUCHERRY', 'PUDUCHERRY', 'PONDICHERRY'),
    ('PUNJAB', 'MUKTSAR', 'PUNJAB', 'SRI MUKTSAR SAHIB'),
    ('PUNJAB', 'SAHIBZADA AJIT SINGH NAGAR', 'PUNJAB', 'S.A.S NAGAR'),
    ('RAJASTHAN', 'CHITTAURGARH', 'RAJASTHAN', 'CHITTORGARH'),
    ('RAJASTHAN', 'DHAULPUR', 'RAJASTHAN', 'DHOLPUR'),
    ('TAMIL NADU', 'KANCHEEPURAM', 'TAMIL NADU', 'KANCHIPURAM'),
    ('TAMIL NADU', 'THOOTHUKKUDI', 'TAMIL NADU', 'TUTICORIN'),
    ('TELANGANA', 'WARANGAL RURAL', 'TELANGANA', 'WARANGAL'),
    ('TELANGANA', 'WARANGAL URBAN', 'TELANGANA', 'WARANGAL'),
    ('UTTAR PRADESH', 'ALLAHABAD', 'UTTAR PRADESH', 'PRAYAGRAJ'),
    ('UTTAR PRADESH', 'FAIZABAD', 'UTTAR PRADESH', 'AYODHYA'),
    ('UTTAR PRADESH', 'JYOTIBA PHULE NAGAR', 'UTTAR PRADESH', 'AMROHA'),
    ('UTTAR PRADESH', 'KANSHIRAM NAGAR', 'UTTAR PRADESH', 'KASGANJ'),
    ('UTTAR PRADESH', 'MAHAMAYA NAGAR', 'UTTAR PRADESH', 'HATHRAS'),
    ('UTTAR PRADESH', 'SANT RAVIDAS NAGAR (BHADOHI)', 'UTTAR PRADESH', 'BHADOHI'),
    ('UTTAR PRADESH', 'SHRAWASTI', 'UTTAR PRADESH', 'SHRAVASTI'),
    ('UTTARAKHAND', 'GARHWAL', 'UTTARAKHAND', 'PAURI GARHWAL'),
    ('WEST BENGAL', 'DAKSHIN DINAJPUR', 'WEST BENGAL', 'DINAJPUR DAKSHIN'),
    ('WEST BENGAL', 'DARJILING', 'WEST BENGAL', 'DARJEELING'),
    ('WEST BENGAL', 'HAORA', 'WEST BENGAL', 'HOWRAH'),
    ('WEST BENGAL', 'HUGLI', 'WEST BENGAL', 'HOOGHLY'),
    ('WEST BENGAL', 'KOCH BIHAR', 'WEST BENGAL', 'COOCHBEHAR'),
    ('WEST BENGAL', 'NORTH TWENTY FOUR PARGANA', 'WEST BENGAL', '24 PARAGANAS NORTH'),
    ('WEST BENGAL', 'PASCHIM MEDINIPUR', 'WEST BENGAL', 'MEDINIPUR WEST'),
    ('WEST BENGAL', 'PURBA MEDINIPUR', 'WEST BENGAL', 'MEDINIPUR EAST'),
    ('WEST BENGAL', 'SOUTH TWENTY FOUR PARGANA', 'WEST BENGAL', '24 PARAGANAS SOUTH'),
    ('WEST BENGAL', 'UTTAR DINAJPUR', 'WEST BENGAL', 'DINAJPUR UTTAR')
),
nfhs_canon AS (
  SELECT
    COALESCE(da.canonical_state_norm, sa.canonical_state_norm, n.state_norm_raw) AS state_canon,
    COALESCE(da.canonical_district_norm, n.district_norm_raw) AS district_canon,
    TRY_CAST(n.institutional_birth AS DOUBLE) AS institutional_birth,
    TRY_CAST(n.stunting             AS DOUBLE) AS stunting
  FROM nfhs_norm n
  LEFT JOIN state_alias sa  ON n.state_norm_raw = sa.nfhs_state_norm
  LEFT JOIN district_alias da
    ON n.state_norm_raw = da.nfhs_state_norm
   AND n.district_norm_raw = da.nfhs_district_norm
),
pin_norm AS (
  SELECT DISTINCT
    REGEXP_REPLACE(UPPER(TRIM(statename)), '\\s+', ' ') AS state_canon,
    REGEXP_REPLACE(UPPER(TRIM(REPLACE(district, '-', ' '))), '\\s+', ' ') AS district_canon,
    pincode
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.india_post_pincode_directory
),
districts AS (
  SELECT DISTINCT state_canon, district_canon
  FROM pin_norm
  WHERE state_canon IS NOT NULL AND state_canon <> ''
    AND district_canon IS NOT NULL AND district_canon <> ''
),
fac AS (
  SELECT
    f.unique_id,
    CAST(f.address_zipOrPostcode AS STRING) AS pincode,
    LOWER(
      COALESCE(f.specialties, '') || ' ' ||
      COALESCE(f.capability,  '') || ' ' ||
      COALESCE(f.description, '')
    ) AS hay
  FROM databricks_virtue_foundation_dataset_dais_2026.virtue_foundation_dataset.facilities f
  WHERE f.address_zipOrPostcode IS NOT NULL
    AND f.address_zipOrPostcode NOT IN ('', 'null')
),
fac_district AS (
  SELECT f.*, p.state_canon, p.district_canon
  FROM fac f
  JOIN pin_norm p ON f.pincode = CAST(p.pincode AS STRING)
),
fac_agg AS (
  SELECT
    state_canon,
    district_canon,
    COUNT(*) AS total_facilities,
    SUM(CASE WHEN hay LIKE '%icu%' OR hay LIKE '%intensive care%' OR hay LIKE '%critical care%' OR hay LIKE '%ventilator%' OR hay LIKE '%ccm%' THEN 1 ELSE 0 END) AS match_icu,
    SUM(CASE WHEN hay LIKE '%maternity%' OR hay LIKE '%obstetric%' OR hay LIKE '%delivery%' OR hay LIKE '%labour%' OR hay LIKE '%prenatal%' OR hay LIKE '%antenatal%' OR hay LIKE '%midwifery%' THEN 1 ELSE 0 END) AS match_maternity,
    SUM(CASE WHEN hay LIKE '%emergency%' OR hay LIKE '%casualty%' OR hay LIKE '%trauma%' OR hay LIKE '%accident%' OR hay LIKE '%a&e%' OR hay LIKE '%24 hour%' THEN 1 ELSE 0 END) AS match_emergency,
    SUM(CASE WHEN hay LIKE '%dialysis%' OR hay LIKE '%renal%' OR hay LIKE '%nephrology%' OR hay LIKE '%kidney%' THEN 1 ELSE 0 END) AS match_dialysis,
    SUM(CASE WHEN hay LIKE '%oncology%' OR hay LIKE '%cancer%' OR hay LIKE '%chemotherapy%' OR hay LIKE '%radiation%' OR hay LIKE '%tumour%' THEN 1 ELSE 0 END) AS match_oncology,
    SUM(CASE WHEN hay LIKE '%trauma%' OR hay LIKE '%orthopedic%' OR hay LIKE '%fracture%' OR hay LIKE '%spine%' OR hay LIKE '%neurosurgery%' THEN 1 ELSE 0 END) AS match_trauma,
    SUM(CASE WHEN hay LIKE '%nicu%' OR hay LIKE '%neonatal%' OR hay LIKE '%newborn intensive%' OR hay LIKE '%premature%' THEN 1 ELSE 0 END) AS match_nicu
  FROM fac_district
  GROUP BY state_canon, district_canon
),
joined AS (
  SELECT
    d.state_canon,
    d.district_canon,
    COALESCE(fa.total_facilities, 0) AS total_facilities,
    COALESCE(fa.match_icu, 0)        AS match_icu,
    COALESCE(fa.match_maternity, 0)  AS match_maternity,
    COALESCE(fa.match_emergency, 0)  AS match_emergency,
    COALESCE(fa.match_dialysis, 0)   AS match_dialysis,
    COALESCE(fa.match_oncology, 0)   AS match_oncology,
    COALESCE(fa.match_trauma, 0)     AS match_trauma,
    COALESCE(fa.match_nicu, 0)       AS match_nicu,
    n.institutional_birth,
    n.stunting
  FROM districts d
  LEFT JOIN fac_agg fa
    ON d.state_canon = fa.state_canon AND d.district_canon = fa.district_canon
  LEFT JOIN nfhs_canon n
    ON d.state_canon = n.state_canon AND d.district_canon = n.district_canon
)
SELECT * FROM joined