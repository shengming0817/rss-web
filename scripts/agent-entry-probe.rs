//! Read-only conformance probe against the fixed Agent execution-contract crate.
use execution_contract::{EntryIntent, ENTRY_URI_BYTES, PAGE_NODES};
use serde_json::json;

fn main() {
    let namespace = "instance=17c72b26-774a-492c-9bf4-5e1c47c8501e&tenant=534610c5-1c82-42b1-bc9d-4b834c973cb3&device=fixture%20%2B%20%E6%B5%8B%E8%AF%95&registration=360a2191-9d5f-4fea-9f5c-6ecb02394aad&generation=3";
    let version = "version=11111111-1111-4111-8111-111111111111&revision=4";
    let cases = [
        ("id/534610c5-1c82-42b1-bc9d-4b834c973cb3", version),
        ("tool/policy_534610c51c8242b1bc9d4b834c973cb3", version),
        ("alias/repair.device", version),
        ("event/repair.event", ""),
        ("batch/11111111-1111-4111-8111-111111111111", ""),
        (
            "task/11111111-1111-4111-8111-111111111111",
            "attempt=22222222-2222-4222-8222-222222222222&step=install.1",
        ),
        (
            "activity/mdm.policy:11111111-1111-4111-8111-111111111111",
            "step=verify.1",
        ),
        ("node/tasks.management", ""),
    ];
    let vectors: Vec<_> = cases
        .iter()
        .map(|(selector, fields)| {
            let suffix = if fields.is_empty() {
                String::new()
            } else {
                format!("&{fields}")
            };
            let intent =
                EntryIntent::parse(&format!("rssmdm://view/v1/{selector}?{namespace}{suffix}"))
                    .expect("valid view address");
            let uri = intent.uri().expect("canonical view address");
            assert_eq!(EntryIntent::parse(&uri).unwrap().uri().unwrap(), uri);
            json!({"intent": intent, "uri": uri})
        })
        .collect();
    for invalid in [
        "&confirm=true",
        "&parameters=%7B%22secret%22%3A%22value%22%7D",
        "&server=https%3A%2F%2Felsewhere.test",
        "&generation=4",
        "&step=other",
    ] {
        assert!(EntryIntent::parse(&format!(
            "rssmdm://view/v1/event/repair.event?{namespace}{invalid}"
        ))
        .is_err());
    }
    let unaddressable_aliases = [".", ".."];
    for alias in unaddressable_aliases {
        let intent = EntryIntent::parse(&format!(
            "rssmdm://view/v1/alias/{alias}?{namespace}&{version}"
        ))
        .expect("the existing CLI accepts the alias");
        assert!(intent.uri().and_then(|uri| EntryIntent::parse(&uri)).is_err());
    }
    println!(
        "{}",
        json!({"schema": schemars::schema_for!(EntryIntent), "nodes": PAGE_NODES, "maxBytes": ENTRY_URI_BYTES, "vectors": vectors, "unaddressableAliases": unaddressable_aliases})
    );
}
