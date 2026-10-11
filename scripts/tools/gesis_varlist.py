"""Writes the documentation embedded in GESIS survey files — variable names,
question labels and answer labels — and nothing else.

    /usr/bin/python3 scripts/tools/gesis_varlist.py ~/Downloads

GESIS's terms forbid processing their data with AI tools. This script is run
by a person, reads only the file's metadata (pyreadstat metadataonly=True:
no respondent row is ever loaded), and writes ZAxxxx_variables.txt next to the
data. Those lists are the same information a GESIS codebook publishes, and are
what the aggregation scripts are written from.
"""
import sys
import pathlib
import pyreadstat

folder = pathlib.Path(sys.argv[1]).expanduser()
done = set()
for f in sorted(folder.glob('ZA*_v*.sav')) + sorted(folder.glob('ZA*_v*.dta')):
    study = f.name.split('_')[0]
    if study in done:
        continue
    reader = pyreadstat.read_sav if f.suffix == '.sav' else pyreadstat.read_dta
    _, meta = reader(str(f), metadataonly=True)
    out = folder / f'{study}_variables.txt'
    with open(out, 'w', encoding='utf-8') as o:
        o.write(f'{f.name}: {meta.number_columns} variables, {meta.number_rows} rows (rows not read)\n\n')
        for name in meta.column_names:
            o.write(f'{name}\t{meta.column_names_to_labels.get(name) or ""}\n')
            labels = meta.variable_value_labels.get(name)
            if labels and len(labels) <= 40:
                o.write('\t\t' + ' | '.join(f'{k}={v}' for k, v in labels.items()) + '\n')
    done.add(study)
    print(f'{study}: {meta.number_columns} variables -> {out.name}')
