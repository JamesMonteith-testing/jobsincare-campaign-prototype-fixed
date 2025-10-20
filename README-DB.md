# JobsInCare • DB Dump/Restore & Startup Notes

## 1) Dump the local MySQL `postcode_locations` database

> Prompts for your MySQL password.

```bat
:: Create a backups folder if needed
cd C:\job-campaign-manager
if not exist backups mkdir backups

:: Dump single table (recommended)
mysqldump -h localhost -P 3306 -u YOUR_USER -p postcode_locations os_open_names --default-character-set=utf8mb4 > backups\os_open_names.sql

:: (Optional) Zip the dump
tar -a -c -f backups\os_open_names.zip -C backups os_open_names.sql
