# User Content

This folder is where the owner of the books supplies their own text and structured mechanics.

Recommended flow:

1. Run `npm run phb:build`
2. Copy `sample-user-patch.json`
3. Fill in owned content for matching entity ids
4. Run `npm run phb:import -- .\\rules\\user-content\\your-file.json`
5. Run `npm run phb:audit`

CSV import is also supported for simple text patching with headers:

`id,user_supplied_text,notes,verbatim_reference`
