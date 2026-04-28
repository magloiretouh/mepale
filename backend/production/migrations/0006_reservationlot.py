# Generated manually — 2026-03-22
# P2-D : Réservation granulaire par lot (ReservationLot).

import django.db.models.deletion
import django.core.validators
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0005_ordrefabrication_lignes_snapshot'),
    ]

    operations = [
        migrations.CreateModel(
            name='ReservationLot',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('quantite_reservee', models.DecimalField(
                    decimal_places=4, max_digits=12,
                    validators=[django.core.validators.MinValueValidator(0.0001)],
                    verbose_name='Quantité réservée',
                )),
                ('date_reservation', models.DateTimeField(auto_now_add=True, verbose_name='Date réservation')),
                ('article', models.ForeignKey(
                    on_delete=django.db.models.deletion.PROTECT,
                    related_name='reservations_lot',
                    to='production.article',
                )),
                ('lot', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='reservations',
                    to='production.lot',
                )),
                ('ordre_fabrication', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='reservations',
                    to='production.ordrefabrication',
                )),
            ],
            options={
                'verbose_name': 'Réservation de lot',
                'verbose_name_plural': 'Réservations de lots',
            },
        ),
        migrations.AddConstraint(
            model_name='reservationlot',
            constraint=models.UniqueConstraint(
                fields=['ordre_fabrication', 'lot'],
                name='unique_reservation_of_lot',
            ),
        ),
    ]
