# Entity Relationship Diagram

```mermaid
erDiagram
  CHARACTER_DRAFT ||--o{ CONTENT_PACK : references
  CHARACTER_DRAFT {
    string id
    string name
    string classId
    string speciesId
    string backgroundId
    int level
    string serialized
  }
  CONTENT_PACK {
    string id
    string slug
    string sourceType
    string licenseTag
    string manifest
  }
```
