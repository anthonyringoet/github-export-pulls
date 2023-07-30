# Github Pull Request Exporter

Highly un-optimized GitHub pull request data exporter.
Exports for an organization and groups by repository.

## Usage

```sh
npm install

# See .example.env, set values

# run in test mode (= only act on first found repository)
node index.js test

# Run the damn script
node index.js

# Output can be found in `./output`
```
