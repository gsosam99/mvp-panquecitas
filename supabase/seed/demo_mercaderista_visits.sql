-- ============================================================
-- Seed sintético — Mercaderistas (demo)
-- 70 visitas + 204 filas de inventario (anaquel/bodega).
-- Datos de campo 100% ficticios. NO toca sap_sell_in_records — sin cifras SAP inventadas.
-- ============================================================

insert into public.mercaderista_visits
  (id, location_id, worker_first_name, worker_last_name, worker_cedula,
   pop_present, product_present, product_location, product_location_other,
   front_faces, deposit_access, created_at)
values
  (
    '687fbb64-3ffe-4f43-8fbb-20a686ff36ed', '8cc1a49d-c0a9-4ec9-be35-72fdd9031ddf', 'Yusmely', 'Pereira', '19876543',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    3, true, '2026-07-13T15:51:00.000Z'
  ),
  (
    '8fa56da7-f941-4b81-8368-f53901c61fa8', '2e3da327-0b92-4190-a627-36f46a91ce32', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    8, true, '2026-07-28T15:36:00.000Z'
  ),
  (
    '67461c73-adad-4748-adcf-b67fe7658ed3', 'be657cbc-462e-4f0d-9624-04ebc4bca11e', 'Yusmely', 'Pereira', '19876543',
    true, false,
    null, null,
    null, true, '2026-07-19T13:40:00.000Z'
  ),
  (
    '8ec0a161-dd55-41b2-a329-f119dbb1938c', 'afb6ca57-2620-4bf5-a786-babef8a4861a', 'Yusmely', 'Pereira', '19876543',
    true, false,
    null, null,
    null, true, '2026-07-17T20:09:00.000Z'
  ),
  (
    '295e3e08-1d50-4863-9ce8-4e6cbdbee84b', '58b57567-305b-4b1b-97ef-36b6f096f5ec', 'Andreina', 'Sequera', '21345678',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    0, true, '2026-07-04T15:26:00.000Z'
  ),
  (
    '2add01b7-6d74-4260-b38e-95681498d578', '40da5425-f3f9-409d-a51b-f9e624579295', 'Andreina', 'Sequera', '21345678',
    false, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    1, true, '2026-07-19T14:12:00.000Z'
  ),
  (
    '0af41c86-fd9d-4fd6-9e0d-237c5c2101c6', '92d73e8a-6c8f-4947-87e1-95f2a76fa9fd', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    3, false, '2026-07-18T16:29:00.000Z'
  ),
  (
    '533c7a02-3afb-4c30-b02d-c94713c76ae2', '819fdbde-c8df-4fa5-b84f-e9c29e6200ac', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    7, false, '2026-07-26T19:45:00.000Z'
  ),
  (
    '852d2cee-95b6-474c-b88e-39319416d726', 'e4b63a51-91a7-4305-839a-b2fc218dd0d5', 'Yusmely', 'Pereira', '19876543',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    6, true, '2026-07-22T21:04:00.000Z'
  ),
  (
    'a363ceba-adcc-4f2a-9d12-689015c0afa4', 'b3adec33-81af-476c-beed-131ec66638e8', 'Jose', 'Martinez', '17654321',
    false, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    1, false, '2026-07-26T21:52:00.000Z'
  ),
  (
    'eb1559f2-775f-4322-94be-66c71cebe253', '28417fce-2cdd-42bf-88b9-61665165f621', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    3, true, '2026-07-12T20:45:00.000Z'
  ),
  (
    '033449dd-311a-48d7-9e26-aed06126921e', '6137ce03-ae45-4d49-9f32-dea71d6f25b4', 'Andreina', 'Sequera', '21345678',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    0, false, '2026-07-18T15:46:00.000Z'
  ),
  (
    'b81f1ce8-c713-4d30-a231-c9a2fab5cdf6', '2651610e-82b9-4946-8eb3-b677ba4c7eb8', 'Yusmely', 'Pereira', '19876543',
    false, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    2, true, '2026-07-24T12:48:00.000Z'
  ),
  (
    'e4f73d01-1a2a-4992-ab53-75637ac27384', 'b66fec9f-bffa-4079-bac7-561974fdee75', 'Maria', 'Gonzalez', '18234567',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    2, true, '2026-07-14T21:03:00.000Z'
  ),
  (
    '8d8f15e0-048b-4c6a-968b-94cc0aa4ae77', 'b0723749-ac87-43ba-868a-f8522fc52b1a', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    0, false, '2026-07-15T15:26:00.000Z'
  ),
  (
    'e952efb6-8311-46e8-9cf2-9803185ae460', '7462de51-22af-4989-b0fc-19b76f44fc35', 'Andreina', 'Sequera', '21345678',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    7, true, '2026-07-26T13:27:00.000Z'
  ),
  (
    'b4764769-b434-4b20-8930-c8c2b1204956', '69b358fa-ab0d-4f4f-93d9-6fb7e51500ba', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    8, true, '2026-07-27T19:56:00.000Z'
  ),
  (
    '135bb533-0556-41b0-9e7e-1be796d9d635', '5dfc4063-0c1f-4d3b-8618-4ee00eb7ad64', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    5, false, '2026-07-09T14:22:00.000Z'
  ),
  (
    '0bfd0383-cc80-4a61-b754-615c68c4cbde', 'b589c39d-a74c-4aa5-acf5-cf918eb0cd31', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    2, true, '2026-07-02T18:56:00.000Z'
  ),
  (
    '9bb7e795-de21-4336-a872-ba72101aa9fe', '78ea3f67-7e19-4f52-9191-68de29e89f09', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    8, true, '2026-07-01T20:28:00.000Z'
  ),
  (
    '026745af-e8c9-4c28-8521-5f3e219904bc', '9865e6ee-9cab-449c-93f6-0c81d956352c', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    7, false, '2026-07-07T19:20:00.000Z'
  ),
  (
    'b42a8bca-0da2-4783-b72b-1fe09ed4dfaa', '4448ced8-9ec2-4e02-8c46-3cf88c3b3aa3', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    3, true, '2026-07-27T21:05:00.000Z'
  ),
  (
    '07cc1817-07fc-463e-bb79-ffe67bc41392', 'c9f2c49a-c921-4171-9c8e-40e020dc14a8', 'Yusmely', 'Pereira', '19876543',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    7, true, '2026-07-09T12:15:00.000Z'
  ),
  (
    '2239379d-fd94-4983-a77e-4892fa1fb24d', '216a2c6a-8be9-4975-b919-2d6f66b8d52e', 'Andreina', 'Sequera', '21345678',
    true, false,
    null, null,
    null, true, '2026-07-28T15:11:00.000Z'
  ),
  (
    '7d0b7a7b-ab3f-4f98-aeaa-f99c6531971a', '4349c7a5-2992-4ea3-8408-37b78bc63ead', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    7, true, '2026-07-04T20:29:00.000Z'
  ),
  (
    '3ac7240f-af12-4432-b1e9-9167fd60c7cb', 'b69439ae-1588-4da1-81ea-5aad9ff70707', 'Maria', 'Gonzalez', '18234567',
    true, true,
    ARRAY['OTRA_CATEGORIA']::text[], null,
    1, true, '2026-07-28T20:57:00.000Z'
  ),
  (
    '70351bc2-0857-4602-ab53-f7e34c75d4a0', '0f5afba1-d554-4a2d-8d49-3213465bfc3c', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['OTRA_CATEGORIA']::text[], null,
    7, true, '2026-07-15T12:35:00.000Z'
  ),
  (
    '334485ed-9a31-4c67-9589-c634ce58543a', 'd56363f8-0bc7-47f1-886d-f6b505f18c17', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    6, true, '2026-07-21T19:30:00.000Z'
  ),
  (
    'd6043974-8cd9-4235-ba9e-2c7ce74d08f3', '35d47b15-0459-4740-ab1e-b9803d733240', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['OTRA_CATEGORIA']::text[], null,
    8, true, '2026-07-04T19:12:00.000Z'
  ),
  (
    'eb5dc71f-5988-4114-b271-4cee19ab9749', '5feffea0-5eac-49bf-9b18-174b0ce2e917', 'Carlos', 'Rodriguez', '20112233',
    false, true,
    ARRAY['OTRA_CATEGORIA']::text[], null,
    1, false, '2026-07-10T17:49:00.000Z'
  ),
  (
    'c9052d88-7948-4163-b806-bd63347c67b5', 'b084f524-1aa5-4db6-9f1a-9c382c35cc0a', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    6, false, '2026-07-30T13:03:00.000Z'
  ),
  (
    'ff77d962-d6e3-4ee6-a4da-c2c9f71138b2', 'dd79d18f-7c4d-49be-8b03-367ef412885f', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    5, false, '2026-07-28T21:28:00.000Z'
  ),
  (
    'ba2a73e0-21e8-44b7-85d2-32114fb5aab5', 'ee0ef011-cac5-4078-b00a-27cbf7131cac', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    5, false, '2026-07-01T20:31:00.000Z'
  ),
  (
    '3507e329-5912-492a-9b14-b70c9d50c652', '4eae3002-2975-40fa-800c-7d2acbd226d1', 'Maria', 'Gonzalez', '18234567',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    2, true, '2026-07-24T17:27:00.000Z'
  ),
  (
    'be111391-33fa-4203-8f52-a43e27ed653b', '6425753d-32bd-45e8-8876-663a86c2ae9f', 'Luis', 'Fernandez', '16789012',
    false, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    3, false, '2026-07-26T17:05:00.000Z'
  ),
  (
    'edfd4c47-655e-41d2-98e8-7f92dd5e68c7', 'd62156f3-5bd3-423a-abee-6f112a7e52ca', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    7, true, '2026-07-28T13:07:00.000Z'
  ),
  (
    '669d7d31-f68c-41fe-9fa7-b54d56d58d00', '814b493e-a8d9-47c1-b8e9-8ec9755255af', 'Carlos', 'Rodriguez', '20112233',
    false, false,
    null, null,
    null, true, '2026-07-01T13:17:00.000Z'
  ),
  (
    '98ed789b-07c2-4363-9344-9d3daf88c858', '2d95309d-18c1-4682-9fd7-dc0125ac65b1', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    8, false, '2026-07-02T16:57:00.000Z'
  ),
  (
    '099a2a2b-9d77-407e-913a-c3232ea633aa', 'a4c0adbc-e6fd-451d-b0af-5881deb4b54d', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    2, true, '2026-07-03T21:26:00.000Z'
  ),
  (
    '5d48107b-c61e-4962-a89e-312f75a1ad4f', '55630fa7-65a0-4381-87fb-3a9b1968449d', 'Yusmely', 'Pereira', '19876543',
    false, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    1, false, '2026-07-11T13:02:00.000Z'
  ),
  (
    '46414568-b303-436d-8478-d568647236a4', '69ed4041-968b-48d8-9d86-5b17666edc21', 'Maria', 'Gonzalez', '18234567',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    7, false, '2026-07-04T21:55:00.000Z'
  ),
  (
    '93e4c7c1-e0f4-442e-a219-8f8afd2b1c7b', 'e1fa50f6-67c5-4df6-9ff0-749b3c6cff95', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    4, false, '2026-07-14T14:36:00.000Z'
  ),
  (
    '757d7cda-b6aa-4137-9721-a5c1c061cbd9', '30c016d6-fd70-475e-be28-bc53ae1aa69e', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    8, true, '2026-07-15T14:39:00.000Z'
  ),
  (
    'ae1588e5-8d65-4982-842c-f97dee5c22b2', '7c56364b-68b8-4303-a0f5-9f1bbba2e7ee', 'Yusmely', 'Pereira', '19876543',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    2, true, '2026-07-10T20:21:00.000Z'
  ),
  (
    '1e0ca1f8-3263-4da6-bdb9-76e8b1a329ee', '0e9ba244-5d57-4d4d-bf5f-5e0b1a2e231d', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    3, true, '2026-07-22T16:58:00.000Z'
  ),
  (
    'ad9e0028-7395-410d-ba64-506c67876106', 'f8298e17-fd95-4a5b-a451-94c857d7de69', 'Yusmely', 'Pereira', '19876543',
    false, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    8, true, '2026-07-02T20:26:00.000Z'
  ),
  (
    'de089e08-1a04-478f-9463-56250ffb9d13', '3ece7ee8-9b89-4637-ab85-eff3231299bc', 'Yusmely', 'Pereira', '19876543',
    false, false,
    null, null,
    null, true, '2026-07-27T20:40:00.000Z'
  ),
  (
    '1d22c44e-d0ac-4968-b08a-57fd51eb5429', 'a7ebfdf8-89f6-4b4c-a6df-5c61aa82740a', 'Andreina', 'Sequera', '21345678',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    4, true, '2026-07-15T14:33:00.000Z'
  ),
  (
    '8994485d-fb55-436c-9568-abe9647a171d', 'f02d436e-d5c9-4172-87e0-6122a542495c', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    3, true, '2026-07-03T16:57:00.000Z'
  ),
  (
    'dad34403-2dfd-4228-808a-f3b4d9d05dae', '5f372299-826d-4468-ab15-2b5216e14bc8', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    2, true, '2026-07-17T18:58:00.000Z'
  ),
  (
    'c4f0d3ee-fdd5-4591-804d-724685ae3e68', 'a3c7ec09-b80b-4380-ae7b-c81dd1b50e5e', 'Andreina', 'Sequera', '21345678',
    false, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    6, false, '2026-07-01T19:49:00.000Z'
  ),
  (
    'fa8df7b6-90da-4522-b809-f76163fc4932', 'c6aec74a-fa40-4204-b9f4-e1fd8709ccf6', 'Yusmely', 'Pereira', '19876543',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    7, true, '2026-07-14T20:22:00.000Z'
  ),
  (
    'a11b32de-2ed5-4fd4-aa34-e992f87a15ec', 'fd0b24b2-1963-4a32-b438-f3dbec334c6a', 'Carlos', 'Rodriguez', '20112233',
    true, false,
    null, null,
    null, true, '2026-07-26T21:06:00.000Z'
  ),
  (
    'f4efc187-da9d-4ef5-9fd1-57d8e652dc94', '963813e2-79fe-41de-b4d2-1ff80025bd6d', 'Yusmely', 'Pereira', '19876543',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    7, false, '2026-07-13T21:24:00.000Z'
  ),
  (
    '912a2a74-7ac5-4dd5-8266-2edad61b01c5', 'b8f98df5-f0a7-4e80-93a6-3a9ea8e43aaf', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['OTRA_CATEGORIA']::text[], null,
    8, true, '2026-07-09T20:09:00.000Z'
  ),
  (
    'e04ef345-7629-47ad-a62b-dfa2aebcfe2e', '3dde170e-7c57-4b33-b440-a7726b0e2770', 'Maria', 'Gonzalez', '18234567',
    true, false,
    null, null,
    null, true, '2026-07-22T14:32:00.000Z'
  ),
  (
    'c49a280e-cc3c-4ba6-9c59-235702e70120', '8354a521-1dba-4b16-80eb-e63992750415', 'Carlos', 'Rodriguez', '20112233',
    true, false,
    null, null,
    null, false, '2026-07-28T12:04:00.000Z'
  ),
  (
    '29c51379-250a-4a7c-bf7f-23ddea5770c6', '51ffe629-222b-44b3-b562-3cdd4c5a9a87', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['OTRA_CATEGORIA']::text[], null,
    6, true, '2026-07-20T18:00:00.000Z'
  ),
  (
    '73323ff7-c629-4b89-b16b-db47ec43c74b', 'd610b4bd-2d6c-42df-bf3f-cf8db1fd50c1', 'Luis', 'Fernandez', '16789012',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    5, true, '2026-07-26T15:19:00.000Z'
  ),
  (
    '8801cae6-1bab-4208-9a59-18b7e56483e1', '382dc182-2df5-467e-83cb-c21d012f4bee', 'Jose', 'Martinez', '17654321',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    7, true, '2026-07-25T16:22:00.000Z'
  ),
  (
    '96d2bfbb-61f8-4110-bde5-49487717663e', '1b993175-07ad-487d-8bda-b72956100f2c', 'Yusmely', 'Pereira', '19876543',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    6, false, '2026-07-19T12:16:00.000Z'
  ),
  (
    '8abf034f-c216-4832-8068-8c5b921e389e', '9fd97d32-3ff9-43af-a845-01d5adb7e785', 'Carlos', 'Rodriguez', '20112233',
    false, false,
    null, null,
    null, false, '2026-07-08T14:13:00.000Z'
  ),
  (
    '0150f4b8-4597-47a3-9bb4-26c50d21faea', 'b4223cc7-f4c5-4d97-b6a5-92bfe96419ad', 'Andreina', 'Sequera', '21345678',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    3, true, '2026-07-27T17:07:00.000Z'
  ),
  (
    '275156a3-488c-45e7-adfc-c53117058978', '86b13ee3-e546-435b-abf7-8563a86d7626', 'Andreina', 'Sequera', '21345678',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    6, true, '2026-07-02T19:52:00.000Z'
  ),
  (
    '46699f4d-26b1-4400-a4ae-bd31c45a1b1a', '8437c3cc-8689-4d12-a8b2-c18a9bab008d', 'Carlos', 'Rodriguez', '20112233',
    true, false,
    null, null,
    null, true, '2026-07-02T14:30:00.000Z'
  ),
  (
    '46851320-b34b-45cc-bd68-0ca386aaad97', 'bbca89a3-9216-4d03-983d-2e7bd58af7fb', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    6, true, '2026-07-16T21:12:00.000Z'
  ),
  (
    'b7044d42-a7fb-49be-90ea-30a1c55837a8', '2088c6f7-4948-4787-b11d-2821b6ac3cd8', 'Maria', 'Gonzalez', '18234567',
    true, true,
    ARRAY['HARINA_TRIGO','OTRA_CATEGORIA']::text[], null,
    6, true, '2026-07-02T14:27:00.000Z'
  ),
  (
    '4f92dd79-2893-4839-a15a-0a1c7860b7d6', '3143b0f6-c79e-4db0-975b-ba4913d702bf', 'Yusmely', 'Pereira', '19876543',
    true, false,
    null, null,
    null, true, '2026-07-03T19:40:00.000Z'
  ),
  (
    '672144f7-51fe-45a7-9abd-7c699da01a8e', '1a210966-c2c6-4f94-ab9d-f364a70dfd4c', 'Carlos', 'Rodriguez', '20112233',
    true, true,
    ARRAY['HARINA_TRIGO']::text[], null,
    3, true, '2026-07-06T20:24:00.000Z'
  ),
  (
    'e5bc9995-4f13-4eef-b83c-bdaff0b9ab65', '2372658f-b71f-4adc-97f9-253a9e7c7bbe', 'Maria', 'Gonzalez', '18234567',
    true, true,
    ARRAY['OTRA_CATEGORIA']::text[], null,
    6, true, '2026-07-07T17:27:00.000Z'
  );

insert into public.inventory_audits
  (id, visit_id, location_id, variant_id, zone, quantity, unit_price_observed, calculated_value, created_at)
values
  (
    'd9256751-d006-4337-bf58-35b874db46e7', '687fbb64-3ffe-4f43-8fbb-20a686ff36ed', '8cc1a49d-c0a9-4ec9-be35-72fdd9031ddf', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    9, 1.29,
    null, '2026-07-13T15:51:00.000Z'
  ),
  (
    '964551e9-8010-4626-87cd-43bb7ae4e3ab', '687fbb64-3ffe-4f43-8fbb-20a686ff36ed', '8cc1a49d-c0a9-4ec9-be35-72fdd9031ddf', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.79,
    null, '2026-07-13T15:51:00.000Z'
  ),
  (
    '3f7602c9-6279-4d86-9367-934680894e9f', '687fbb64-3ffe-4f43-8fbb-20a686ff36ed', '8cc1a49d-c0a9-4ec9-be35-72fdd9031ddf', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    49.92, '2026-07-13T15:51:00.000Z'
  ),
  (
    '0dfb10a2-0d7a-4752-8465-caec73b6a309', '687fbb64-3ffe-4f43-8fbb-20a686ff36ed', '8cc1a49d-c0a9-4ec9-be35-72fdd9031ddf', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    2, null,
    67.68, '2026-07-13T15:51:00.000Z'
  ),
  (
    '31b522ff-ee44-4df2-b05b-a8e38e3f0615', '8fa56da7-f941-4b81-8368-f53901c61fa8', '2e3da327-0b92-4190-a627-36f46a91ce32', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    4, 1.55,
    null, '2026-07-28T15:36:00.000Z'
  ),
  (
    '38ce5fab-e229-4854-83b3-eb17e14d78ff', '8fa56da7-f941-4b81-8368-f53901c61fa8', '2e3da327-0b92-4190-a627-36f46a91ce32', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.88,
    null, '2026-07-28T15:36:00.000Z'
  ),
  (
    'ab4a451b-886f-4934-800a-4a3f14cd5421', '8fa56da7-f941-4b81-8368-f53901c61fa8', '2e3da327-0b92-4190-a627-36f46a91ce32', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    3, null,
    75.36, '2026-07-28T15:36:00.000Z'
  ),
  (
    'dc671539-c0c8-443b-b46f-8b2ed6d7244a', '67461c73-adad-4748-adcf-b67fe7658ed3', 'be657cbc-462e-4f0d-9624-04ebc4bca11e', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    2, null,
    68.4, '2026-07-19T13:40:00.000Z'
  ),
  (
    'a653d2ce-da41-414d-8008-8bf110d740f9', '8ec0a161-dd55-41b2-a329-f119dbb1938c', 'afb6ca57-2620-4bf5-a786-babef8a4861a', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    128.8, '2026-07-17T20:09:00.000Z'
  ),
  (
    'e78e244c-99e3-4a71-9a7a-9c5d168c82b6', '8ec0a161-dd55-41b2-a329-f119dbb1938c', 'afb6ca57-2620-4bf5-a786-babef8a4861a', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    34.44, '2026-07-17T20:09:00.000Z'
  ),
  (
    'd9d5780d-0bfa-4877-9867-b2210351719e', '295e3e08-1d50-4863-9ce8-4e6cbdbee84b', '58b57567-305b-4b1b-97ef-36b6f096f5ec', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    14, 1.53,
    null, '2026-07-04T15:26:00.000Z'
  ),
  (
    'eaa17bec-4292-4dd6-986b-4f44bc7bcc12', '295e3e08-1d50-4863-9ce8-4e6cbdbee84b', '58b57567-305b-4b1b-97ef-36b6f096f5ec', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.86,
    null, '2026-07-04T15:26:00.000Z'
  ),
  (
    '5ee5e574-c3f2-4803-9a40-dbf142878c54', '295e3e08-1d50-4863-9ce8-4e6cbdbee84b', '58b57567-305b-4b1b-97ef-36b6f096f5ec', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    51.2, '2026-07-04T15:26:00.000Z'
  ),
  (
    '00fdbfad-1038-4c2c-8fcd-00c9bfb3a310', '295e3e08-1d50-4863-9ce8-4e6cbdbee84b', '58b57567-305b-4b1b-97ef-36b6f096f5ec', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    132.96, '2026-07-04T15:26:00.000Z'
  ),
  (
    'a126cf08-8e0f-45cb-870f-c133fe8f7bee', '2add01b7-6d74-4260-b38e-95681498d578', '40da5425-f3f9-409d-a51b-f9e624579295', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    8, 1.64,
    null, '2026-07-19T14:12:00.000Z'
  ),
  (
    '3be8e81b-f451-47d6-bf84-80ef0a7fe653', '2add01b7-6d74-4260-b38e-95681498d578', '40da5425-f3f9-409d-a51b-f9e624579295', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.89,
    null, '2026-07-19T14:12:00.000Z'
  ),
  (
    'ffbe5d6e-e8af-46ec-8e08-05f7d6b24a95', '2add01b7-6d74-4260-b38e-95681498d578', '40da5425-f3f9-409d-a51b-f9e624579295', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    24.8, '2026-07-19T14:12:00.000Z'
  ),
  (
    '80a1d5b9-3c94-4bd4-bfbc-fac8a9970306', '2add01b7-6d74-4260-b38e-95681498d578', '40da5425-f3f9-409d-a51b-f9e624579295', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    135.84, '2026-07-19T14:12:00.000Z'
  ),
  (
    'a3506857-2a03-45dd-afcf-e17a48bb3a9e', '0af41c86-fd9d-4fd6-9e0d-237c5c2101c6', '92d73e8a-6c8f-4947-87e1-95f2a76fa9fd', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    13, 1.55,
    null, '2026-07-18T16:29:00.000Z'
  ),
  (
    '9b67721a-b54e-472c-ab22-02bbe3b3a6aa', '0af41c86-fd9d-4fd6-9e0d-237c5c2101c6', '92d73e8a-6c8f-4947-87e1-95f2a76fa9fd', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.84,
    null, '2026-07-18T16:29:00.000Z'
  ),
  (
    '31ad4ae3-8c0e-4844-93b0-e6fa40a68ddf', '533c7a02-3afb-4c30-b02d-c94713c76ae2', '819fdbde-c8df-4fa5-b84f-e9c29e6200ac', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    6, 1.92,
    null, '2026-07-26T19:45:00.000Z'
  ),
  (
    'b8a44c0c-2475-412f-8f77-bad0d578cd52', '533c7a02-3afb-4c30-b02d-c94713c76ae2', '819fdbde-c8df-4fa5-b84f-e9c29e6200ac', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    8, 2.86,
    null, '2026-07-26T19:45:00.000Z'
  ),
  (
    'd142d0fe-7ff0-4786-b9ac-7d013e383a60', '852d2cee-95b6-474c-b88e-39319416d726', 'e4b63a51-91a7-4305-839a-b2fc218dd0d5', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    12, 1.63,
    null, '2026-07-22T21:04:00.000Z'
  ),
  (
    '03cc28be-1343-4afd-b707-7a19f4ebc83d', '852d2cee-95b6-474c-b88e-39319416d726', 'e4b63a51-91a7-4305-839a-b2fc218dd0d5', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.87,
    null, '2026-07-22T21:04:00.000Z'
  ),
  (
    '2a5e32bb-e73f-4795-8e5f-0a11e1bd0e86', '852d2cee-95b6-474c-b88e-39319416d726', 'e4b63a51-91a7-4305-839a-b2fc218dd0d5', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    25.92, '2026-07-22T21:04:00.000Z'
  ),
  (
    '64871544-0475-4c18-9d07-8e06c2d07e90', '852d2cee-95b6-474c-b88e-39319416d726', 'e4b63a51-91a7-4305-839a-b2fc218dd0d5', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    6, null,
    203.04, '2026-07-22T21:04:00.000Z'
  ),
  (
    '0b7eba75-8316-4c59-83b2-c1ab1d6c178c', 'a363ceba-adcc-4f2a-9d12-689015c0afa4', 'b3adec33-81af-476c-beed-131ec66638e8', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    11, 1.33,
    null, '2026-07-26T21:52:00.000Z'
  ),
  (
    '31cdd80c-da1d-4ee4-8383-f32213232dda', 'a363ceba-adcc-4f2a-9d12-689015c0afa4', 'b3adec33-81af-476c-beed-131ec66638e8', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    4, 2.86,
    null, '2026-07-26T21:52:00.000Z'
  ),
  (
    '26f85c8f-353a-4dbd-ab55-a0be3b68626f', 'eb1559f2-775f-4322-94be-66c71cebe253', '28417fce-2cdd-42bf-88b9-61665165f621', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    8, 1.43,
    null, '2026-07-12T20:45:00.000Z'
  ),
  (
    'ab9d33a1-cca8-4a47-8390-714d8c6f523c', 'eb1559f2-775f-4322-94be-66c71cebe253', '28417fce-2cdd-42bf-88b9-61665165f621', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 3.14,
    null, '2026-07-12T20:45:00.000Z'
  ),
  (
    'c3274718-a22d-481a-864f-19695700c442', 'eb1559f2-775f-4322-94be-66c71cebe253', '28417fce-2cdd-42bf-88b9-61665165f621', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    0, null,
    null, '2026-07-12T20:45:00.000Z'
  ),
  (
    '3fb0990a-0b8c-4f14-a9a9-a71196d30c0d', 'eb1559f2-775f-4322-94be-66c71cebe253', '28417fce-2cdd-42bf-88b9-61665165f621', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    0, null,
    null, '2026-07-12T20:45:00.000Z'
  ),
  (
    '3ceb5d51-8353-45a8-91a9-62ef48c0ca0b', '033449dd-311a-48d7-9e26-aed06126921e', '6137ce03-ae45-4d49-9f32-dea71d6f25b4', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    10, 1.68,
    null, '2026-07-18T15:46:00.000Z'
  ),
  (
    'f5658b57-cfcb-465c-b2d4-da89ef78de24', '033449dd-311a-48d7-9e26-aed06126921e', '6137ce03-ae45-4d49-9f32-dea71d6f25b4', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    4, 2.79,
    null, '2026-07-18T15:46:00.000Z'
  ),
  (
    'd48e03fd-5dad-424f-bfbd-5807149d18b8', 'b81f1ce8-c713-4d30-a231-c9a2fab5cdf6', '2651610e-82b9-4946-8eb3-b677ba4c7eb8', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    7, 1.58,
    null, '2026-07-24T12:48:00.000Z'
  ),
  (
    '088085e9-6653-422f-824a-ecad5bb9b243', 'b81f1ce8-c713-4d30-a231-c9a2fab5cdf6', '2651610e-82b9-4946-8eb3-b677ba4c7eb8', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.77,
    null, '2026-07-24T12:48:00.000Z'
  ),
  (
    'faae2153-92a7-4f9c-a0c5-799486e129cf', 'b81f1ce8-c713-4d30-a231-c9a2fab5cdf6', '2651610e-82b9-4946-8eb3-b677ba4c7eb8', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    6, null,
    151.68, '2026-07-24T12:48:00.000Z'
  ),
  (
    '2d91ae8e-ea67-4e91-8a00-9bdee56e8aaa', 'b81f1ce8-c713-4d30-a231-c9a2fab5cdf6', '2651610e-82b9-4946-8eb3-b677ba4c7eb8', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    135.84, '2026-07-24T12:48:00.000Z'
  ),
  (
    'ae007caf-fb26-432f-b8a4-7230000b2ee0', 'e4f73d01-1a2a-4992-ab53-75637ac27384', 'b66fec9f-bffa-4079-bac7-561974fdee75', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    13, 1.99,
    null, '2026-07-14T21:03:00.000Z'
  ),
  (
    'f526a68b-dcc2-4485-a96c-9185b1a56431', 'e4f73d01-1a2a-4992-ab53-75637ac27384', 'b66fec9f-bffa-4079-bac7-561974fdee75', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.83,
    null, '2026-07-14T21:03:00.000Z'
  ),
  (
    '7a7974f8-b025-44f7-a47e-628ad7c9bbdd', 'e4f73d01-1a2a-4992-ab53-75637ac27384', 'b66fec9f-bffa-4079-bac7-561974fdee75', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    33.48, '2026-07-14T21:03:00.000Z'
  ),
  (
    'ecd5f56f-be52-4b8c-bcd7-a017141395ca', '8d8f15e0-048b-4c6a-968b-94cc0aa4ae77', 'b0723749-ac87-43ba-868a-f8522fc52b1a', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    8, 1.68,
    null, '2026-07-15T15:26:00.000Z'
  ),
  (
    '73c7bfb8-7049-45e4-945d-4b81fb6eb2d6', '8d8f15e0-048b-4c6a-968b-94cc0aa4ae77', 'b0723749-ac87-43ba-868a-f8522fc52b1a', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    4, 2.79,
    null, '2026-07-15T15:26:00.000Z'
  ),
  (
    'c0f5b704-5d61-49bb-9544-62d8218e98df', 'e952efb6-8311-46e8-9cf2-9803185ae460', '7462de51-22af-4989-b0fc-19b76f44fc35', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    7, 1.55,
    null, '2026-07-26T13:27:00.000Z'
  ),
  (
    '5948751b-ca15-48f6-9c34-085544cd75e7', 'e952efb6-8311-46e8-9cf2-9803185ae460', '7462de51-22af-4989-b0fc-19b76f44fc35', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    8, 2.84,
    null, '2026-07-26T13:27:00.000Z'
  ),
  (
    'e8d5b2bb-7060-47a2-aba9-0c7ee1829d2c', 'e952efb6-8311-46e8-9cf2-9803185ae460', '7462de51-22af-4989-b0fc-19b76f44fc35', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    51.52, '2026-07-26T13:27:00.000Z'
  ),
  (
    'c73317a8-5bc9-4b6b-87d0-b30cea641a69', 'b4764769-b434-4b20-8930-c8c2b1204956', '69b358fa-ab0d-4f4f-93d9-6fb7e51500ba', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    8, 1.65,
    null, '2026-07-27T19:56:00.000Z'
  ),
  (
    'fd08c3da-b50c-444f-b6e6-18ef653ca018', 'b4764769-b434-4b20-8930-c8c2b1204956', '69b358fa-ab0d-4f4f-93d9-6fb7e51500ba', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    2, 2.89,
    null, '2026-07-27T19:56:00.000Z'
  ),
  (
    '698a1a60-6c10-49f8-b147-6e91364d055f', 'b4764769-b434-4b20-8930-c8c2b1204956', '69b358fa-ab0d-4f4f-93d9-6fb7e51500ba', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    24.32, '2026-07-27T19:56:00.000Z'
  ),
  (
    'f9793258-e70b-4fe5-9506-dcf65b6815e3', 'b4764769-b434-4b20-8930-c8c2b1204956', '69b358fa-ab0d-4f4f-93d9-6fb7e51500ba', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    139.68, '2026-07-27T19:56:00.000Z'
  ),
  (
    '6736d3e2-f52f-4618-b92b-b5ac8d45d3c4', '135bb533-0556-41b0-9e7e-1be796d9d635', '5dfc4063-0c1f-4d3b-8618-4ee00eb7ad64', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    4, 1.66,
    null, '2026-07-09T14:22:00.000Z'
  ),
  (
    '9d4cf9be-fbd3-4a82-85ea-b4c8624983d2', '135bb533-0556-41b0-9e7e-1be796d9d635', '5dfc4063-0c1f-4d3b-8618-4ee00eb7ad64', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    2, 2.88,
    null, '2026-07-09T14:22:00.000Z'
  ),
  (
    'd5ec9274-bfb3-4717-bfb7-10e9dece234b', '0bfd0383-cc80-4a61-b754-615c68c4cbde', 'b589c39d-a74c-4aa5-acf5-cf918eb0cd31', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    7, 1.66,
    null, '2026-07-02T18:56:00.000Z'
  ),
  (
    '103f700f-178c-41e1-a00c-9743d5260dc7', '0bfd0383-cc80-4a61-b754-615c68c4cbde', 'b589c39d-a74c-4aa5-acf5-cf918eb0cd31', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.92,
    null, '2026-07-02T18:56:00.000Z'
  ),
  (
    '0b913aab-4612-4000-a91a-44e68e4971c2', '0bfd0383-cc80-4a61-b754-615c68c4cbde', 'b589c39d-a74c-4aa5-acf5-cf918eb0cd31', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    101.76, '2026-07-02T18:56:00.000Z'
  ),
  (
    '96a5d800-f9d2-45ec-983f-f68215458157', '0bfd0383-cc80-4a61-b754-615c68c4cbde', 'b589c39d-a74c-4aa5-acf5-cf918eb0cd31', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    6, null,
    208.08, '2026-07-02T18:56:00.000Z'
  ),
  (
    '93bf8ec6-3a25-496f-86c8-e924589af895', '9bb7e795-de21-4336-a872-ba72101aa9fe', '78ea3f67-7e19-4f52-9191-68de29e89f09', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    5, 1.65,
    null, '2026-07-01T20:28:00.000Z'
  ),
  (
    'ac8dffbe-2bd4-4d6e-9762-11a4d0f13099', '9bb7e795-de21-4336-a872-ba72101aa9fe', '78ea3f67-7e19-4f52-9191-68de29e89f09', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    2, 2.92,
    null, '2026-07-01T20:28:00.000Z'
  ),
  (
    '01c493aa-4b3a-4be4-82b8-5dd30a2fd1b0', '9bb7e795-de21-4336-a872-ba72101aa9fe', '78ea3f67-7e19-4f52-9191-68de29e89f09', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    25.6, '2026-07-01T20:28:00.000Z'
  ),
  (
    'dbc0f776-43d0-45d3-85bd-248879e2b441', '026745af-e8c9-4c28-8521-5f3e219904bc', '9865e6ee-9cab-449c-93f6-0c81d956352c', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    9, 1.59,
    null, '2026-07-07T19:20:00.000Z'
  ),
  (
    '4e18a759-53da-4ec2-916f-004cbd5b97b4', '026745af-e8c9-4c28-8521-5f3e219904bc', '9865e6ee-9cab-449c-93f6-0c81d956352c', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.81,
    null, '2026-07-07T19:20:00.000Z'
  ),
  (
    'a5813494-7de1-40ab-9c02-375eb1ae7e4c', 'b42a8bca-0da2-4783-b72b-1fe09ed4dfaa', '4448ced8-9ec2-4e02-8c46-3cf88c3b3aa3', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    3, 1.63,
    null, '2026-07-27T21:05:00.000Z'
  ),
  (
    '5b20b381-8737-4708-afd7-fe3d9e15b65f', 'b42a8bca-0da2-4783-b72b-1fe09ed4dfaa', '4448ced8-9ec2-4e02-8c46-3cf88c3b3aa3', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    9, 3.24,
    null, '2026-07-27T21:05:00.000Z'
  ),
  (
    'fe4f0c60-fdad-43ff-acf8-8898f89a364c', 'b42a8bca-0da2-4783-b72b-1fe09ed4dfaa', '4448ced8-9ec2-4e02-8c46-3cf88c3b3aa3', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    131.2, '2026-07-27T21:05:00.000Z'
  ),
  (
    '7764e93a-3295-4891-ab0d-1297e3e0becc', 'b42a8bca-0da2-4783-b72b-1fe09ed4dfaa', '4448ced8-9ec2-4e02-8c46-3cf88c3b3aa3', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    5, null,
    166.2, '2026-07-27T21:05:00.000Z'
  ),
  (
    '3456c3e6-d12f-464b-a08d-6aed764f227a', '07cc1817-07fc-463e-bb79-ffe67bc41392', 'c9f2c49a-c921-4171-9c8e-40e020dc14a8', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    12, 1.57,
    null, '2026-07-09T12:15:00.000Z'
  ),
  (
    '181e19b1-e6d1-409f-850c-f32f09090549', '07cc1817-07fc-463e-bb79-ffe67bc41392', 'c9f2c49a-c921-4171-9c8e-40e020dc14a8', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    8, 2.82,
    null, '2026-07-09T12:15:00.000Z'
  ),
  (
    '42997a2f-92ab-464b-9bad-4b85f670e8a4', '07cc1817-07fc-463e-bb79-ffe67bc41392', 'c9f2c49a-c921-4171-9c8e-40e020dc14a8', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    134.4, '2026-07-09T12:15:00.000Z'
  ),
  (
    '155036b6-7398-4821-8b59-9aad7648993c', '07cc1817-07fc-463e-bb79-ffe67bc41392', 'c9f2c49a-c921-4171-9c8e-40e020dc14a8', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    5, null,
    169.2, '2026-07-09T12:15:00.000Z'
  ),
  (
    'd0cce656-1ae7-45c2-98bb-d4382c5f8db4', '2239379d-fd94-4983-a77e-4892fa1fb24d', '216a2c6a-8be9-4975-b919-2d6f66b8d52e', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    49.92, '2026-07-28T15:11:00.000Z'
  ),
  (
    '94493b46-d447-4886-a09f-fb77b82cc6af', '7d0b7a7b-ab3f-4f98-aeaa-f99c6531971a', '4349c7a5-2992-4ea3-8408-37b78bc63ead', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    13, 1.66,
    null, '2026-07-04T20:29:00.000Z'
  ),
  (
    '01c209ca-28bd-40d6-a710-a3dc441255f4', '7d0b7a7b-ab3f-4f98-aeaa-f99c6531971a', '4349c7a5-2992-4ea3-8408-37b78bc63ead', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    10, 2.92,
    null, '2026-07-04T20:29:00.000Z'
  ),
  (
    '4e9919f8-898e-4162-8fcc-a5c602e79453', '7d0b7a7b-ab3f-4f98-aeaa-f99c6531971a', '4349c7a5-2992-4ea3-8408-37b78bc63ead', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    126.4, '2026-07-04T20:29:00.000Z'
  ),
  (
    '646c8169-7504-4a52-90f3-2c5df2e807a9', '7d0b7a7b-ab3f-4f98-aeaa-f99c6531971a', '4349c7a5-2992-4ea3-8408-37b78bc63ead', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    34.56, '2026-07-04T20:29:00.000Z'
  ),
  (
    'b1b4f764-4d5e-4af9-99d8-909249a6337c', '3ac7240f-af12-4432-b1e9-9167fd60c7cb', 'b69439ae-1588-4da1-81ea-5aad9ff70707', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    10, 1.54,
    null, '2026-07-28T20:57:00.000Z'
  ),
  (
    '6f85c306-3863-4f2d-8c1e-c37e9d8bd34a', '3ac7240f-af12-4432-b1e9-9167fd60c7cb', 'b69439ae-1588-4da1-81ea-5aad9ff70707', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.88,
    null, '2026-07-28T20:57:00.000Z'
  ),
  (
    'ea819dc9-f51a-44ef-b3c3-4284360fc9f2', '3ac7240f-af12-4432-b1e9-9167fd60c7cb', 'b69439ae-1588-4da1-81ea-5aad9ff70707', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    0, null,
    null, '2026-07-28T20:57:00.000Z'
  ),
  (
    '5707e51b-90ee-43a8-a0f7-cd52b26fa279', '3ac7240f-af12-4432-b1e9-9167fd60c7cb', 'b69439ae-1588-4da1-81ea-5aad9ff70707', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    0, null,
    null, '2026-07-28T20:57:00.000Z'
  ),
  (
    'b6c18868-4528-464d-8382-9b46c198313b', '70351bc2-0857-4602-ab53-f7e34c75d4a0', '0f5afba1-d554-4a2d-8d49-3213465bfc3c', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    5, 1.94,
    null, '2026-07-15T12:35:00.000Z'
  ),
  (
    'ebae07e6-79ff-493c-bdb1-1eff1d3a40b9', '70351bc2-0857-4602-ab53-f7e34c75d4a0', '0f5afba1-d554-4a2d-8d49-3213465bfc3c', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    8, 2.8,
    null, '2026-07-15T12:35:00.000Z'
  ),
  (
    'e7c98298-d08d-44a9-b0a8-5762cf2dff14', '70351bc2-0857-4602-ab53-f7e34c75d4a0', '0f5afba1-d554-4a2d-8d49-3213465bfc3c', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    0, null,
    null, '2026-07-15T12:35:00.000Z'
  ),
  (
    'bb526dbe-4f8c-45bd-9cce-dc811b6057ab', '70351bc2-0857-4602-ab53-f7e34c75d4a0', '0f5afba1-d554-4a2d-8d49-3213465bfc3c', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    0, null,
    null, '2026-07-15T12:35:00.000Z'
  ),
  (
    'f8b0a872-d479-4ee4-8160-28c98df15271', '334485ed-9a31-4c67-9589-c634ce58543a', 'd56363f8-0bc7-47f1-886d-f6b505f18c17', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    5, 1.67,
    null, '2026-07-21T19:30:00.000Z'
  ),
  (
    'ea8bb6d6-a054-471a-be4a-92bd2aa7c235', '334485ed-9a31-4c67-9589-c634ce58543a', 'd56363f8-0bc7-47f1-886d-f6b505f18c17', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.89,
    null, '2026-07-21T19:30:00.000Z'
  ),
  (
    '16f5748f-1fe5-4097-b03f-d983a0ec0fdb', '334485ed-9a31-4c67-9589-c634ce58543a', 'd56363f8-0bc7-47f1-886d-f6b505f18c17', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    103.04, '2026-07-21T19:30:00.000Z'
  ),
  (
    '78dd9491-d255-420e-9849-9740f10fd2d7', '334485ed-9a31-4c67-9589-c634ce58543a', 'd56363f8-0bc7-47f1-886d-f6b505f18c17', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    33.6, '2026-07-21T19:30:00.000Z'
  ),
  (
    'd4fd44b0-34ca-4499-84bb-e0bb6d7fda6e', 'd6043974-8cd9-4235-ba9e-2c7ce74d08f3', '35d47b15-0459-4740-ab1e-b9803d733240', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    10, 1.68,
    null, '2026-07-04T19:12:00.000Z'
  ),
  (
    'cdd59999-a798-4e4c-b607-b0596af69f14', 'd6043974-8cd9-4235-ba9e-2c7ce74d08f3', '35d47b15-0459-4740-ab1e-b9803d733240', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    3, 2.9,
    null, '2026-07-04T19:12:00.000Z'
  ),
  (
    '10e08d4f-8a30-4d74-a988-5a4272e53d20', 'd6043974-8cd9-4235-ba9e-2c7ce74d08f3', '35d47b15-0459-4740-ab1e-b9803d733240', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    52.8, '2026-07-04T19:12:00.000Z'
  ),
  (
    '4941bea0-10b2-4d4b-acc3-1bcdb5ad655b', 'd6043974-8cd9-4235-ba9e-2c7ce74d08f3', '35d47b15-0459-4740-ab1e-b9803d733240', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    135.36, '2026-07-04T19:12:00.000Z'
  ),
  (
    'c23b52f1-75f4-4153-a808-96ea0ec00979', 'eb5dc71f-5988-4114-b271-4cee19ab9749', '5feffea0-5eac-49bf-9b18-174b0ce2e917', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    11, 1.61,
    null, '2026-07-10T17:49:00.000Z'
  ),
  (
    'fc4bf965-10da-4eee-a2a6-382415f66ec0', 'eb5dc71f-5988-4114-b271-4cee19ab9749', '5feffea0-5eac-49bf-9b18-174b0ce2e917', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.87,
    null, '2026-07-10T17:49:00.000Z'
  ),
  (
    '56eec57c-fac7-40d7-95f5-77ed7cb69203', 'c9052d88-7948-4163-b806-bd63347c67b5', 'b084f524-1aa5-4db6-9f1a-9c382c35cc0a', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    12, 1.68,
    null, '2026-07-30T13:03:00.000Z'
  ),
  (
    '5c1e92cd-0ba9-423c-bd66-458270200f64', 'c9052d88-7948-4163-b806-bd63347c67b5', 'b084f524-1aa5-4db6-9f1a-9c382c35cc0a', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.83,
    null, '2026-07-30T13:03:00.000Z'
  ),
  (
    '9b56aa04-7952-42fb-a35f-2868cdfc56dd', 'ff77d962-d6e3-4ee6-a4da-c2c9f71138b2', 'dd79d18f-7c4d-49be-8b03-367ef412885f', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    3, 1.62,
    null, '2026-07-28T21:28:00.000Z'
  ),
  (
    '4e928269-3ee1-4f44-97de-1364f5c852e3', 'ff77d962-d6e3-4ee6-a4da-c2c9f71138b2', 'dd79d18f-7c4d-49be-8b03-367ef412885f', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.93,
    null, '2026-07-28T21:28:00.000Z'
  ),
  (
    '2a78d287-d12f-4591-9264-03090ecbf0c0', 'ba2a73e0-21e8-44b7-85d2-32114fb5aab5', 'ee0ef011-cac5-4078-b00a-27cbf7131cac', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    11, 1.42,
    null, '2026-07-01T20:31:00.000Z'
  ),
  (
    'c92ef627-f6fe-4f90-b03d-f1ee4aea656f', 'ba2a73e0-21e8-44b7-85d2-32114fb5aab5', 'ee0ef011-cac5-4078-b00a-27cbf7131cac', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    10, 2.8,
    null, '2026-07-01T20:31:00.000Z'
  ),
  (
    '560792bd-12a2-4595-93b1-d96ab0491e28', '3507e329-5912-492a-9b14-b70c9d50c652', '4eae3002-2975-40fa-800c-7d2acbd226d1', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    10, 1.91,
    null, '2026-07-24T17:27:00.000Z'
  ),
  (
    '15237bd5-3384-4e2f-9e9e-bde4fc10ad43', '3507e329-5912-492a-9b14-b70c9d50c652', '4eae3002-2975-40fa-800c-7d2acbd226d1', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.77,
    null, '2026-07-24T17:27:00.000Z'
  ),
  (
    '5576c492-3240-4ed9-8f8c-5fabfea50900', '3507e329-5912-492a-9b14-b70c9d50c652', '4eae3002-2975-40fa-800c-7d2acbd226d1', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    26.88, '2026-07-24T17:27:00.000Z'
  ),
  (
    '899fefca-83e9-4b20-9733-fe3f64bd7779', '3507e329-5912-492a-9b14-b70c9d50c652', '4eae3002-2975-40fa-800c-7d2acbd226d1', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    5, null,
    172.2, '2026-07-24T17:27:00.000Z'
  ),
  (
    '7c643a52-2fd2-4901-bcd0-4bc537245c10', 'be111391-33fa-4203-8f52-a43e27ed653b', '6425753d-32bd-45e8-8876-663a86c2ae9f', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    13, 1.67,
    null, '2026-07-26T17:05:00.000Z'
  ),
  (
    '26534d95-7b72-43d1-a08a-7a3573853cc0', 'be111391-33fa-4203-8f52-a43e27ed653b', '6425753d-32bd-45e8-8876-663a86c2ae9f', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.81,
    null, '2026-07-26T17:05:00.000Z'
  ),
  (
    '6958473d-dedc-46e9-b1f2-ccaa3ae45381', 'edfd4c47-655e-41d2-98e8-7f92dd5e68c7', 'd62156f3-5bd3-423a-abee-6f112a7e52ca', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    5, 1.12,
    null, '2026-07-28T13:07:00.000Z'
  ),
  (
    '76d8e2bc-7835-4001-aa4c-fdd2f046fb77', 'edfd4c47-655e-41d2-98e8-7f92dd5e68c7', 'd62156f3-5bd3-423a-abee-6f112a7e52ca', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.16,
    null, '2026-07-28T13:07:00.000Z'
  ),
  (
    '6b1c3d9e-5e25-4da3-8566-b81648673ec8', 'edfd4c47-655e-41d2-98e8-7f92dd5e68c7', 'd62156f3-5bd3-423a-abee-6f112a7e52ca', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    3, null,
    81, '2026-07-28T13:07:00.000Z'
  ),
  (
    '2bbce267-820a-49b6-885d-faa90ffaee7b', '669d7d31-f68c-41fe-9fa7-b54d56d58d00', '814b493e-a8d9-47c1-b8e9-8ec9755255af', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    76.16, '2026-07-01T13:17:00.000Z'
  ),
  (
    '64b01bd9-2f74-4ad0-9e9d-f5e21c005c49', '669d7d31-f68c-41fe-9fa7-b54d56d58d00', '814b493e-a8d9-47c1-b8e9-8ec9755255af', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    3, null,
    78.84, '2026-07-01T13:17:00.000Z'
  ),
  (
    '0a64de97-5e89-4576-abf5-55583c705c86', '98ed789b-07c2-4363-9344-9d3daf88c858', '2d95309d-18c1-4682-9fd7-dc0125ac65b1', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    5, 1.14,
    null, '2026-07-02T16:57:00.000Z'
  ),
  (
    '6a1befe4-8a49-4ac4-bcf1-80a918248ae5', '98ed789b-07c2-4363-9344-9d3daf88c858', '2d95309d-18c1-4682-9fd7-dc0125ac65b1', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.24,
    null, '2026-07-02T16:57:00.000Z'
  ),
  (
    '3fb768c8-7308-4e09-a31c-bd9faacf0df3', '099a2a2b-9d77-407e-913a-c3232ea633aa', 'a4c0adbc-e6fd-451d-b0af-5881deb4b54d', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    7, 1.22,
    null, '2026-07-03T21:26:00.000Z'
  ),
  (
    '6395f011-653b-4d5e-aefc-96e2c897ee28', '099a2a2b-9d77-407e-913a-c3232ea633aa', 'a4c0adbc-e6fd-451d-b0af-5881deb4b54d', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.21,
    null, '2026-07-03T21:26:00.000Z'
  ),
  (
    '7224c6e9-5b1f-4163-935a-6c0047a0da7d', '099a2a2b-9d77-407e-913a-c3232ea633aa', 'a4c0adbc-e6fd-451d-b0af-5881deb4b54d', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    40.96, '2026-07-03T21:26:00.000Z'
  ),
  (
    'eeea0ca6-2fb0-4b25-895e-b63e425dc7c1', '099a2a2b-9d77-407e-913a-c3232ea633aa', 'a4c0adbc-e6fd-451d-b0af-5881deb4b54d', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    26.04, '2026-07-03T21:26:00.000Z'
  ),
  (
    'afbeb19b-cd4c-4341-bb2d-58787d08af8b', '5d48107b-c61e-4962-a89e-312f75a1ad4f', '55630fa7-65a0-4381-87fb-3a9b1968449d', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    5, 1.13,
    null, '2026-07-11T13:02:00.000Z'
  ),
  (
    'f770acb5-d6b7-4284-ad3d-93f7b498a243', '5d48107b-c61e-4962-a89e-312f75a1ad4f', '55630fa7-65a0-4381-87fb-3a9b1968449d', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    9, 2.12,
    null, '2026-07-11T13:02:00.000Z'
  ),
  (
    'a56a7599-1489-4578-b7a1-9bf501ed7036', '46414568-b303-436d-8478-d568647236a4', '69ed4041-968b-48d8-9d86-5b17666edc21', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    7, 1.27,
    null, '2026-07-04T21:55:00.000Z'
  ),
  (
    '969988dc-de4c-4bcc-bdef-73a309d28e21', '46414568-b303-436d-8478-d568647236a4', '69ed4041-968b-48d8-9d86-5b17666edc21', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    2, 2.2,
    null, '2026-07-04T21:55:00.000Z'
  ),
  (
    'd70fcaa3-7269-4634-85e8-879d98edba12', '93e4c7c1-e0f4-442e-a219-8f8afd2b1c7b', 'e1fa50f6-67c5-4df6-9ff0-749b3c6cff95', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    3, 1.21,
    null, '2026-07-14T14:36:00.000Z'
  ),
  (
    'c0118c94-df25-4202-a089-c93b67813436', '93e4c7c1-e0f4-442e-a219-8f8afd2b1c7b', 'e1fa50f6-67c5-4df6-9ff0-749b3c6cff95', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    9, 2.61,
    null, '2026-07-14T14:36:00.000Z'
  ),
  (
    'd18eefd0-385a-484a-9e55-af7e54649852', '757d7cda-b6aa-4137-9721-a5c1c061cbd9', '30c016d6-fd70-475e-be28-bc53ae1aa69e', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    7, 1.22,
    null, '2026-07-15T14:39:00.000Z'
  ),
  (
    '86bb9106-9fcc-4513-851b-05755fb92e61', '757d7cda-b6aa-4137-9721-a5c1c061cbd9', '30c016d6-fd70-475e-be28-bc53ae1aa69e', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    9, 2.18,
    null, '2026-07-15T14:39:00.000Z'
  ),
  (
    '616362a5-f492-4772-ac4d-7344e113a9d4', '757d7cda-b6aa-4137-9721-a5c1c061cbd9', '30c016d6-fd70-475e-be28-bc53ae1aa69e', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    76.16, '2026-07-15T14:39:00.000Z'
  ),
  (
    '124d68e2-1abb-434f-8fcf-3d09e0ac40e4', '757d7cda-b6aa-4137-9721-a5c1c061cbd9', '30c016d6-fd70-475e-be28-bc53ae1aa69e', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    25.68, '2026-07-15T14:39:00.000Z'
  ),
  (
    'b8ba8fbb-9e3f-40e3-b114-3a5afdadf35c', 'ae1588e5-8d65-4982-842c-f97dee5c22b2', '7c56364b-68b8-4303-a0f5-9f1bbba2e7ee', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    10, 1.13,
    null, '2026-07-10T20:21:00.000Z'
  ),
  (
    '75da8db3-fc48-4fec-b3b5-43e051592af3', 'ae1588e5-8d65-4982-842c-f97dee5c22b2', '7c56364b-68b8-4303-a0f5-9f1bbba2e7ee', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    3, 2.21,
    null, '2026-07-10T20:21:00.000Z'
  ),
  (
    'dc469b6b-4ea0-44f5-a8aa-bfae8732d39e', 'ae1588e5-8d65-4982-842c-f97dee5c22b2', '7c56364b-68b8-4303-a0f5-9f1bbba2e7ee', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    5, null,
    132, '2026-07-10T20:21:00.000Z'
  ),
  (
    'f2b84521-478a-4c30-8ff3-cf11c2178e24', '1e0ca1f8-3263-4da6-bdb9-76e8b1a329ee', '0e9ba244-5d57-4d4d-bf5f-5e0b1a2e231d', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    7, 1.28,
    null, '2026-07-22T16:58:00.000Z'
  ),
  (
    'db425227-e5f4-434b-88d3-828649e84d03', '1e0ca1f8-3263-4da6-bdb9-76e8b1a329ee', '0e9ba244-5d57-4d4d-bf5f-5e0b1a2e231d', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    3, 2.18,
    null, '2026-07-22T16:58:00.000Z'
  ),
  (
    '77025520-4a4f-478d-a046-8fd6ddacab27', '1e0ca1f8-3263-4da6-bdb9-76e8b1a329ee', '0e9ba244-5d57-4d4d-bf5f-5e0b1a2e231d', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    2, null,
    52.8, '2026-07-22T16:58:00.000Z'
  ),
  (
    'a3bd7b59-61b4-45af-a72e-42524501a387', 'ad9e0028-7395-410d-ba64-506c67876106', 'f8298e17-fd95-4a5b-a451-94c857d7de69', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    9, 1.61,
    null, '2026-07-02T20:26:00.000Z'
  ),
  (
    '27f59b75-81da-4928-92a5-05ff5325a37c', 'ad9e0028-7395-410d-ba64-506c67876106', 'f8298e17-fd95-4a5b-a451-94c857d7de69', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    3, 2.53,
    null, '2026-07-02T20:26:00.000Z'
  ),
  (
    'dc3eaefb-b366-436c-adc2-84b5a7185ad0', 'ad9e0028-7395-410d-ba64-506c67876106', 'f8298e17-fd95-4a5b-a451-94c857d7de69', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    92, '2026-07-02T20:26:00.000Z'
  ),
  (
    'd91541a2-5941-431e-b133-d77ef2929104', 'ad9e0028-7395-410d-ba64-506c67876106', 'f8298e17-fd95-4a5b-a451-94c857d7de69', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    2, null,
    53.28, '2026-07-02T20:26:00.000Z'
  ),
  (
    '5510533f-121a-4053-94b9-ca137443b8e7', 'de089e08-1a04-478f-9463-56250ffb9d13', '3ece7ee8-9b89-4637-ab85-eff3231299bc', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    97.6, '2026-07-27T20:40:00.000Z'
  ),
  (
    '71d4de34-95a2-4e9b-b810-3d6215085073', 'de089e08-1a04-478f-9463-56250ffb9d13', '3ece7ee8-9b89-4637-ab85-eff3231299bc', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    26.4, '2026-07-27T20:40:00.000Z'
  ),
  (
    'af5200ae-4fb1-4e6c-8742-5afe940f7102', '1d22c44e-d0ac-4968-b08a-57fd51eb5429', 'a7ebfdf8-89f6-4b4c-a6df-5c61aa82740a', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    13, 1.21,
    null, '2026-07-15T14:33:00.000Z'
  ),
  (
    '7becabbd-a03a-44ab-9332-8d3ca8695f00', '1d22c44e-d0ac-4968-b08a-57fd51eb5429', 'a7ebfdf8-89f6-4b4c-a6df-5c61aa82740a', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    10, 2.03,
    null, '2026-07-15T14:33:00.000Z'
  ),
  (
    '19f1ba04-7e3a-45d8-8a67-4f6675c9902c', '1d22c44e-d0ac-4968-b08a-57fd51eb5429', 'a7ebfdf8-89f6-4b4c-a6df-5c61aa82740a', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    0, null,
    null, '2026-07-15T14:33:00.000Z'
  ),
  (
    '341d6ec1-15a0-4512-830e-4c983b147f7e', '1d22c44e-d0ac-4968-b08a-57fd51eb5429', 'a7ebfdf8-89f6-4b4c-a6df-5c61aa82740a', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    0, null,
    null, '2026-07-15T14:33:00.000Z'
  ),
  (
    'de9548f0-69c2-451c-81b8-c5e8e093055a', '8994485d-fb55-436c-9568-abe9647a171d', 'f02d436e-d5c9-4172-87e0-6122a542495c', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    12, 1.15,
    null, '2026-07-03T16:57:00.000Z'
  ),
  (
    '3d843dfa-d085-4ce3-9633-3fad7b17d3f3', '8994485d-fb55-436c-9568-abe9647a171d', 'f02d436e-d5c9-4172-87e0-6122a542495c', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.24,
    null, '2026-07-03T16:57:00.000Z'
  ),
  (
    '5e9a862c-8e70-4b6f-96c5-193834ffaba7', '8994485d-fb55-436c-9568-abe9647a171d', 'f02d436e-d5c9-4172-87e0-6122a542495c', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    0, null,
    null, '2026-07-03T16:57:00.000Z'
  ),
  (
    'c37df445-280d-4053-83fe-f1e44c2efd8e', '8994485d-fb55-436c-9568-abe9647a171d', 'f02d436e-d5c9-4172-87e0-6122a542495c', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    0, null,
    null, '2026-07-03T16:57:00.000Z'
  ),
  (
    '201efa29-1c81-45ae-9fd0-a614de6affd9', 'dad34403-2dfd-4228-808a-f3b4d9d05dae', '5f372299-826d-4468-ab15-2b5216e14bc8', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    11, 1.17,
    null, '2026-07-17T18:58:00.000Z'
  ),
  (
    '6280312d-a9af-4d90-a23d-ace93fd91171', 'dad34403-2dfd-4228-808a-f3b4d9d05dae', '5f372299-826d-4468-ab15-2b5216e14bc8', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    9, 2.28,
    null, '2026-07-17T18:58:00.000Z'
  ),
  (
    '19aba8ce-8207-4eed-8705-3786b980c7c8', 'dad34403-2dfd-4228-808a-f3b4d9d05dae', '5f372299-826d-4468-ab15-2b5216e14bc8', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    74.88, '2026-07-17T18:58:00.000Z'
  ),
  (
    '96f5ed3d-6ea0-44e4-992a-94cc171586ef', 'dad34403-2dfd-4228-808a-f3b4d9d05dae', '5f372299-826d-4468-ab15-2b5216e14bc8', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    105.12, '2026-07-17T18:58:00.000Z'
  ),
  (
    '73df9326-19a2-4ec9-9e84-ff0227df253e', 'c4f0d3ee-fdd5-4591-804d-724685ae3e68', 'a3c7ec09-b80b-4380-ae7b-c81dd1b50e5e', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    14, 1.16,
    null, '2026-07-01T19:49:00.000Z'
  ),
  (
    'ab41c4f2-f86e-4612-9e89-e8e1b66e999b', 'c4f0d3ee-fdd5-4591-804d-724685ae3e68', 'a3c7ec09-b80b-4380-ae7b-c81dd1b50e5e', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.51,
    null, '2026-07-01T19:49:00.000Z'
  ),
  (
    '6a4de31b-c167-46a2-a499-a5142d941366', 'fa8df7b6-90da-4522-b809-f76163fc4932', 'c6aec74a-fa40-4204-b9f4-e1fd8709ccf6', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    10, 1,
    null, '2026-07-14T20:22:00.000Z'
  ),
  (
    '6be33295-f964-4d57-a02c-33994645e91e', 'fa8df7b6-90da-4522-b809-f76163fc4932', 'c6aec74a-fa40-4204-b9f4-e1fd8709ccf6', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    8, 2.12,
    null, '2026-07-14T20:22:00.000Z'
  ),
  (
    '286b3380-4b81-4f91-9469-dcb827140a49', 'fa8df7b6-90da-4522-b809-f76163fc4932', 'c6aec74a-fa40-4204-b9f4-e1fd8709ccf6', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    19.84, '2026-07-14T20:22:00.000Z'
  ),
  (
    '9283cd84-5f12-455a-9180-bf95b5ae624e', 'fa8df7b6-90da-4522-b809-f76163fc4932', 'c6aec74a-fa40-4204-b9f4-e1fd8709ccf6', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    6, null,
    160.56, '2026-07-14T20:22:00.000Z'
  ),
  (
    '59fa3697-6611-4e9b-8420-2221299fe7c1', 'a11b32de-2ed5-4fd4-aa34-e992f87a15ec', 'fd0b24b2-1963-4a32-b438-f3dbec334c6a', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    76.8, '2026-07-26T21:06:00.000Z'
  ),
  (
    '8bc12f8d-15b1-4a72-aea6-ad1984bf527c', 'f4efc187-da9d-4ef5-9fd1-57d8e652dc94', '963813e2-79fe-41de-b4d2-1ff80025bd6d', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    4, 1.18,
    null, '2026-07-13T21:24:00.000Z'
  ),
  (
    '140a937c-c980-4721-ba4d-a9f0b43e3fc7', 'f4efc187-da9d-4ef5-9fd1-57d8e652dc94', '963813e2-79fe-41de-b4d2-1ff80025bd6d', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.28,
    null, '2026-07-13T21:24:00.000Z'
  ),
  (
    '5ff107bc-875a-4703-895f-420f85641397', '912a2a74-7ac5-4dd5-8266-2edad61b01c5', 'b8f98df5-f0a7-4e80-93a6-3a9ea8e43aaf', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    10, 1.21,
    null, '2026-07-09T20:09:00.000Z'
  ),
  (
    'e680f4b9-9b75-4ff4-9e34-5be6f7d65010', '912a2a74-7ac5-4dd5-8266-2edad61b01c5', 'b8f98df5-f0a7-4e80-93a6-3a9ea8e43aaf', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.22,
    null, '2026-07-09T20:09:00.000Z'
  ),
  (
    '4d093a46-5108-49a2-a2e6-f7b783d3085e', '912a2a74-7ac5-4dd5-8266-2edad61b01c5', 'b8f98df5-f0a7-4e80-93a6-3a9ea8e43aaf', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    6, null,
    112.32, '2026-07-09T20:09:00.000Z'
  ),
  (
    'd5b872f2-8ef5-4a87-88be-b84c88fa3087', '912a2a74-7ac5-4dd5-8266-2edad61b01c5', 'b8f98df5-f0a7-4e80-93a6-3a9ea8e43aaf', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    5, null,
    133.2, '2026-07-09T20:09:00.000Z'
  ),
  (
    'c27b6d38-57a1-42d1-802b-565c329810eb', 'e04ef345-7629-47ad-a62b-dfa2aebcfe2e', '3dde170e-7c57-4b33-b440-a7726b0e2770', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    71.68, '2026-07-22T14:32:00.000Z'
  ),
  (
    '22777a74-ced1-4c28-b261-eb00546cacc7', 'e04ef345-7629-47ad-a62b-dfa2aebcfe2e', '3dde170e-7c57-4b33-b440-a7726b0e2770', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    3, null,
    81, '2026-07-22T14:32:00.000Z'
  ),
  (
    '79d348bc-ac78-43b4-a8f8-46677342505f', '29c51379-250a-4a7c-bf7f-23ddea5770c6', '51ffe629-222b-44b3-b562-3cdd4c5a9a87', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    14, 1.54,
    null, '2026-07-20T18:00:00.000Z'
  ),
  (
    'ace8bf40-5963-4be6-aae9-a9946cbf091c', '29c51379-250a-4a7c-bf7f-23ddea5770c6', '51ffe629-222b-44b3-b562-3cdd4c5a9a87', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    9, 2.27,
    null, '2026-07-20T18:00:00.000Z'
  ),
  (
    '7105ced8-606d-4963-ada1-a37fad3eb961', '29c51379-250a-4a7c-bf7f-23ddea5770c6', '51ffe629-222b-44b3-b562-3cdd4c5a9a87', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    97.6, '2026-07-20T18:00:00.000Z'
  ),
  (
    '33d193a4-b4e4-4006-87d1-d292caccc057', '29c51379-250a-4a7c-bf7f-23ddea5770c6', '51ffe629-222b-44b3-b562-3cdd4c5a9a87', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    106.08, '2026-07-20T18:00:00.000Z'
  ),
  (
    '2ef01aa0-a7a3-4253-a0a5-a2a76b997a4a', '73323ff7-c629-4b89-b16b-db47ec43c74b', 'd610b4bd-2d6c-42df-bf3f-cf8db1fd50c1', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    4, 1.49,
    null, '2026-07-26T15:19:00.000Z'
  ),
  (
    'edba646f-15ea-45be-8ce0-f2b457cbeb54', '73323ff7-c629-4b89-b16b-db47ec43c74b', 'd610b4bd-2d6c-42df-bf3f-cf8db1fd50c1', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    8, 2.15,
    null, '2026-07-26T15:19:00.000Z'
  ),
  (
    'de3a8f16-0679-466e-8885-eb81f0d6af15', '73323ff7-c629-4b89-b16b-db47ec43c74b', 'd610b4bd-2d6c-42df-bf3f-cf8db1fd50c1', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    37.76, '2026-07-26T15:19:00.000Z'
  ),
  (
    '0db1fa65-ca97-4d4e-819e-04724812e2a4', '73323ff7-c629-4b89-b16b-db47ec43c74b', 'd610b4bd-2d6c-42df-bf3f-cf8db1fd50c1', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    27.12, '2026-07-26T15:19:00.000Z'
  ),
  (
    '30f2ccfd-c33c-4535-a2ff-2fead952a72f', '8801cae6-1bab-4208-9a59-18b7e56483e1', '382dc182-2df5-467e-83cb-c21d012f4bee', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    6, 1.12,
    null, '2026-07-25T16:22:00.000Z'
  ),
  (
    '41049378-43c8-4039-bfa1-7260e4249839', '8801cae6-1bab-4208-9a59-18b7e56483e1', '382dc182-2df5-467e-83cb-c21d012f4bee', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    4, 2.13,
    null, '2026-07-25T16:22:00.000Z'
  ),
  (
    '5127c9bc-d025-4ca3-b43d-d9fec64923f3', '8801cae6-1bab-4208-9a59-18b7e56483e1', '382dc182-2df5-467e-83cb-c21d012f4bee', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    20.48, '2026-07-25T16:22:00.000Z'
  ),
  (
    '55fc0a9e-8021-4f6e-b388-954f59342734', '96d2bfbb-61f8-4110-bde5-49487717663e', '1b993175-07ad-487d-8bda-b72956100f2c', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    13, 1.17,
    null, '2026-07-19T12:16:00.000Z'
  ),
  (
    '6089edaa-a765-4bd6-8426-0fe24dac1c70', '96d2bfbb-61f8-4110-bde5-49487717663e', '1b993175-07ad-487d-8bda-b72956100f2c', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    4, 2.21,
    null, '2026-07-19T12:16:00.000Z'
  ),
  (
    'ad13f9b6-3f19-4f6b-9885-f9607dcaa5fb', '0150f4b8-4597-47a3-9bb4-26c50d21faea', 'b4223cc7-f4c5-4d97-b6a5-92bfe96419ad', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    8, 1.24,
    null, '2026-07-27T17:07:00.000Z'
  ),
  (
    'dc71f563-4ccb-46f1-a54e-47dabf4122ef', '0150f4b8-4597-47a3-9bb4-26c50d21faea', 'b4223cc7-f4c5-4d97-b6a5-92bfe96419ad', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.23,
    null, '2026-07-27T17:07:00.000Z'
  ),
  (
    'd5bfbdbe-4a51-4e1b-ad28-4fdb1705e076', '0150f4b8-4597-47a3-9bb4-26c50d21faea', 'b4223cc7-f4c5-4d97-b6a5-92bfe96419ad', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    6, null,
    155.52, '2026-07-27T17:07:00.000Z'
  ),
  (
    '4c464ea1-bed3-48d2-a0ca-5485e36e182c', '275156a3-488c-45e7-adfc-c53117058978', '86b13ee3-e546-435b-abf7-8563a86d7626', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    11, 1.47,
    null, '2026-07-02T19:52:00.000Z'
  ),
  (
    'c02f9643-d002-4814-b46c-e6cd322539ed', '275156a3-488c-45e7-adfc-c53117058978', '86b13ee3-e546-435b-abf7-8563a86d7626', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.17,
    null, '2026-07-02T19:52:00.000Z'
  ),
  (
    '5a68dbc3-ddbb-4290-80bf-c78deb491285', '275156a3-488c-45e7-adfc-c53117058978', '86b13ee3-e546-435b-abf7-8563a86d7626', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    20.16, '2026-07-02T19:52:00.000Z'
  ),
  (
    'bc42474d-faeb-42d1-a008-02b616a43a7d', '275156a3-488c-45e7-adfc-c53117058978', '86b13ee3-e546-435b-abf7-8563a86d7626', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    4, null,
    106.56, '2026-07-02T19:52:00.000Z'
  ),
  (
    '11a78629-92ea-497a-a295-9c1c6f1e9355', '46699f4d-26b1-4400-a4ae-bd31c45a1b1a', '8437c3cc-8689-4d12-a8b2-c18a9bab008d', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    6, null,
    116.16, '2026-07-02T14:30:00.000Z'
  ),
  (
    'efe7dde1-f7f2-486f-a5f6-4c335e99900a', '46699f4d-26b1-4400-a4ae-bd31c45a1b1a', '8437c3cc-8689-4d12-a8b2-c18a9bab008d', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    2, null,
    50.88, '2026-07-02T14:30:00.000Z'
  ),
  (
    'daeffba8-c0a7-4733-930a-7ac5f8713567', '46851320-b34b-45cc-bd68-0ca386aaad97', 'bbca89a3-9216-4d03-983d-2e7bd58af7fb', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    11, 1.16,
    null, '2026-07-16T21:12:00.000Z'
  ),
  (
    '980dea71-9ec8-4ad8-b77a-a8cf3ff1d82a', '46851320-b34b-45cc-bd68-0ca386aaad97', 'bbca89a3-9216-4d03-983d-2e7bd58af7fb', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    5, 2.14,
    null, '2026-07-16T21:12:00.000Z'
  ),
  (
    '8c7dbd01-8025-4962-827d-b41f7630f4f8', '46851320-b34b-45cc-bd68-0ca386aaad97', 'bbca89a3-9216-4d03-983d-2e7bd58af7fb', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    5, null,
    91.2, '2026-07-16T21:12:00.000Z'
  ),
  (
    '8c31e38f-e0cb-45a6-a8d9-ba4a575cdee7', '46851320-b34b-45cc-bd68-0ca386aaad97', 'bbca89a3-9216-4d03-983d-2e7bd58af7fb', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    2, null,
    53.28, '2026-07-16T21:12:00.000Z'
  ),
  (
    'e95155ac-9402-4e08-8399-48ecb815fd85', 'b7044d42-a7fb-49be-90ea-30a1c55837a8', '2088c6f7-4948-4787-b11d-2821b6ac3cd8', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    6, 1.28,
    null, '2026-07-02T14:27:00.000Z'
  ),
  (
    'c77589a5-b888-4fc4-84e9-e8ea237560dc', 'b7044d42-a7fb-49be-90ea-30a1c55837a8', '2088c6f7-4948-4787-b11d-2821b6ac3cd8', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    10, 1.98,
    null, '2026-07-02T14:27:00.000Z'
  ),
  (
    '9a0ba436-e6d1-472b-9dcc-36052817a0cd', 'b7044d42-a7fb-49be-90ea-30a1c55837a8', '2088c6f7-4948-4787-b11d-2821b6ac3cd8', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    0, null,
    null, '2026-07-02T14:27:00.000Z'
  ),
  (
    '4cc0f33d-3a87-4bde-bb2d-50330ea54c7a', 'b7044d42-a7fb-49be-90ea-30a1c55837a8', '2088c6f7-4948-4787-b11d-2821b6ac3cd8', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    0, null,
    null, '2026-07-02T14:27:00.000Z'
  ),
  (
    'b5cb727c-5f7c-4324-9273-7abf358bc855', '4f92dd79-2893-4839-a15a-0a1c7860b7d6', '3143b0f6-c79e-4db0-975b-ba4913d702bf', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    2, null,
    40.32, '2026-07-03T19:40:00.000Z'
  ),
  (
    '79ba6440-5881-42d4-b5dd-4938a50f390f', '4f92dd79-2893-4839-a15a-0a1c7860b7d6', '3143b0f6-c79e-4db0-975b-ba4913d702bf', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    6, null,
    155.52, '2026-07-03T19:40:00.000Z'
  ),
  (
    '0e9f5b96-77f1-45f7-9605-8a3b767086c2', '672144f7-51fe-45a7-9abd-7c699da01a8e', '1a210966-c2c6-4f94-ab9d-f364a70dfd4c', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    6, 1.12,
    null, '2026-07-06T20:24:00.000Z'
  ),
  (
    'b992229d-5686-4db4-9b9c-02e7a892434f', '672144f7-51fe-45a7-9abd-7c699da01a8e', '1a210966-c2c6-4f94-ab9d-f364a70dfd4c', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    6, 2.23,
    null, '2026-07-06T20:24:00.000Z'
  ),
  (
    '0b9a6f6d-b1af-4373-9381-d427aa810218', '672144f7-51fe-45a7-9abd-7c699da01a8e', '1a210966-c2c6-4f94-ab9d-f364a70dfd4c', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    4, null,
    72.32, '2026-07-06T20:24:00.000Z'
  ),
  (
    'e7f2bbe8-93c0-49b9-a390-a1d9875dcdc3', '672144f7-51fe-45a7-9abd-7c699da01a8e', '1a210966-c2c6-4f94-ab9d-f364a70dfd4c', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    1, null,
    26.28, '2026-07-06T20:24:00.000Z'
  ),
  (
    '471528dd-a3c5-4449-a2a2-b6fe473f6479', 'e5bc9995-4f13-4eef-b83c-bdaff0b9ab65', '2372658f-b71f-4adc-97f9-253a9e7c7bbe', '20000000-0000-0000-0000-000000000003', 'ANAQUEL',
    14, 1.26,
    null, '2026-07-07T17:27:00.000Z'
  ),
  (
    '401c8ce7-b366-4f92-9e9b-a05e64c4ffac', 'e5bc9995-4f13-4eef-b83c-bdaff0b9ab65', '2372658f-b71f-4adc-97f9-253a9e7c7bbe', '20000000-0000-0000-0000-000000000004', 'ANAQUEL',
    7, 2.27,
    null, '2026-07-07T17:27:00.000Z'
  ),
  (
    '685ab033-b211-49ae-be45-6c97be42716d', 'e5bc9995-4f13-4eef-b83c-bdaff0b9ab65', '2372658f-b71f-4adc-97f9-253a9e7c7bbe', '20000000-0000-0000-0000-000000000001', 'BODEGA',
    1, null,
    19.36, '2026-07-07T17:27:00.000Z'
  ),
  (
    'ff484730-2e59-46cb-8b89-2a22f3f90b65', 'e5bc9995-4f13-4eef-b83c-bdaff0b9ab65', '2372658f-b71f-4adc-97f9-253a9e7c7bbe', '20000000-0000-0000-0000-000000000002', 'BODEGA',
    2, null,
    52.08, '2026-07-07T17:27:00.000Z'
  );
